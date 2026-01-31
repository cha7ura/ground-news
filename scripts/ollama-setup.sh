#!/bin/bash
# Pull the Qwen3 embedding model into the Ollama container
# Run this after `docker compose up -d ollama`
#
# Usage:
#   ./scripts/ollama-setup.sh [model_tag]
#
# Examples:
#   ./scripts/ollama-setup.sh                          # default: 0.6b
#   ./scripts/ollama-setup.sh qwen3-embedding:4b       # 4B model
#   ./scripts/ollama-setup.sh qwen3-embedding:8b       # 8B model

set -e

MODEL="${1:-qwen3-embedding:0.6b}"
CONTAINER="ground-news-ollama"
OLLAMA_URL="http://localhost:11434"

echo "Waiting for Ollama to be ready..."
until curl -sf "$OLLAMA_URL/api/tags" > /dev/null 2>&1; do
  sleep 1
done

echo "Pulling model: $MODEL"
docker exec "$CONTAINER" ollama pull "$MODEL"

echo "Verifying model is loaded..."
curl -sf "$OLLAMA_URL/api/tags" | grep -o "\"$MODEL\"" > /dev/null && \
  echo "Model $MODEL is ready." || \
  echo "Warning: Model may not have loaded correctly. Check with: docker exec $CONTAINER ollama list"

echo ""
echo "Embedding endpoint available at: $OLLAMA_URL/v1/embeddings"
echo "  model: $MODEL"
echo ""
echo "Test with:"
echo "  curl $OLLAMA_URL/v1/embeddings -d '{\"model\":\"$MODEL\",\"input\":\"test\"}'"
