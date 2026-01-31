# Patched zep_graphiti.py — fixes:
# 1. Embedding model not being configured from env vars (https://github.com/getzep/graphiti/issues/491)
# 2. Per-request client closing before async worker finishes (singleton pattern)
# Mount this file over /app/graph_service/zep_graphiti.py in the container.

import logging
from typing import Annotated

from fastapi import Depends, HTTPException
from graphiti_core import Graphiti  # type: ignore
from graphiti_core.edges import EntityEdge  # type: ignore
from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig  # type: ignore
from graphiti_core.errors import EdgeNotFoundError, GroupsEdgesNotFoundError, NodeNotFoundError
from graphiti_core.llm_client import LLMClient  # type: ignore
from graphiti_core.nodes import EntityNode, EpisodicNode  # type: ignore

from graph_service.config import ZepEnvDep, get_settings
from graph_service.dto import FactResult

logger = logging.getLogger(__name__)

# Singleton client — shared across requests and background worker
_shared_client: 'ZepGraphiti | None' = None


class ZepGraphiti(Graphiti):
    def __init__(self, uri: str, user: str, password: str, llm_client: LLMClient | None = None):
        super().__init__(uri, user, password, llm_client)

    async def save_entity_node(self, name: str, uuid: str, group_id: str, summary: str = ''):
        new_node = EntityNode(
            name=name,
            uuid=uuid,
            group_id=group_id,
            summary=summary,
        )
        await new_node.generate_name_embedding(self.embedder)
        await new_node.save(self.driver)
        return new_node

    async def get_entity_edge(self, uuid: str):
        try:
            edge = await EntityEdge.get_by_uuid(self.driver, uuid)
            return edge
        except EdgeNotFoundError as e:
            raise HTTPException(status_code=404, detail=e.message) from e

    async def delete_group(self, group_id: str):
        try:
            edges = await EntityEdge.get_by_group_ids(self.driver, [group_id])
        except GroupsEdgesNotFoundError:
            logger.warning(f'No edges found for group {group_id}')
            edges = []

        nodes = await EntityNode.get_by_group_ids(self.driver, [group_id])

        episodes = await EpisodicNode.get_by_group_ids(self.driver, [group_id])

        for edge in edges:
            await edge.delete(self.driver)

        for node in nodes:
            await node.delete(self.driver)

        for episode in episodes:
            await episode.delete(self.driver)

    async def delete_entity_edge(self, uuid: str):
        try:
            edge = await EntityEdge.get_by_uuid(self.driver, uuid)
            await edge.delete(self.driver)
        except EdgeNotFoundError as e:
            raise HTTPException(status_code=404, detail=e.message) from e

    async def delete_episodic_node(self, uuid: str):
        try:
            episode = await EpisodicNode.get_by_uuid(self.driver, uuid)
            await episode.delete(self.driver)
        except NodeNotFoundError as e:
            raise HTTPException(status_code=404, detail=e.message) from e


def _create_configured_client(settings) -> ZepGraphiti:
    """Create a ZepGraphiti client with LLM and embedder configured from env vars."""
    client = ZepGraphiti(
        uri=settings.neo4j_uri,
        user=settings.neo4j_user,
        password=settings.neo4j_password,
    )
    # Configure LLM client
    if settings.openai_base_url is not None:
        client.llm_client.config.base_url = settings.openai_base_url
    if settings.openai_api_key is not None:
        client.llm_client.config.api_key = settings.openai_api_key
    if settings.model_name is not None:
        client.llm_client.model = settings.model_name
        client.llm_client.config.small_model = settings.model_name

    # Configure embedder to use the same base URL and model from env vars
    # This fixes the bug where embedder defaults to text-embedding-3-small
    # Must also update client.clients.embedder since GraphitiClients is set in __init__
    if settings.embedding_model_name is not None:
        embedder_config = OpenAIEmbedderConfig(
            api_key=settings.openai_api_key or 'ollama',
            base_url=settings.openai_base_url,
            embedding_model=settings.embedding_model_name,
        )
        embedder = OpenAIEmbedder(config=embedder_config)
        client.embedder = embedder
        client.clients.embedder = embedder

    return client


def _get_shared_client() -> ZepGraphiti:
    """Return a long-lived singleton client. Not closed between requests."""
    global _shared_client
    if _shared_client is None:
        settings = get_settings()
        _shared_client = _create_configured_client(settings)
        logger.info(
            'Created shared Graphiti client (model=%s, embedding=%s)',
            settings.model_name,
            settings.embedding_model_name,
        )
    return _shared_client


async def get_graphiti(settings: ZepEnvDep):
    """FastAPI dependency — returns the shared singleton client."""
    yield _get_shared_client()


async def initialize_graphiti(settings: ZepEnvDep):
    client = _get_shared_client()
    await client.build_indices_and_constraints()


def get_fact_result_from_edge(edge: EntityEdge):
    return FactResult(
        uuid=edge.uuid,
        name=edge.name,
        fact=edge.fact,
        valid_at=edge.valid_at,
        invalid_at=edge.invalid_at,
        created_at=edge.created_at,
        expired_at=edge.expired_at,
    )


ZepGraphitiDep = Annotated[ZepGraphiti, Depends(get_graphiti)]
