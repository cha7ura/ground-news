// AI provider configuration
// Switches embedding provider based on APP_ENV; LLM always uses OpenRouter.
//
// Embeddings (local):
//   - "ollama"   (default) — runs in Docker via docker-compose, self-contained
//   - "lmstudio" — requires LM Studio desktop app running separately
// Embeddings (production): OpenAI text-embedding-ada-002
// LLM: OpenRouter in both local and production (only external service for local dev)
//
// Set EMBEDDING_PROVIDER in your env to switch local embedding backend.

export type AppEnv = 'local' | 'production';
export type EmbeddingProvider = 'ollama' | 'lmstudio' | 'openai';
export type LLMProvider = 'lmstudio' | 'openrouter';

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  baseUrl: string;
  model: string;
  dimensions: number;
  apiKey: string | undefined;
  maxInputLength: number;
}

export interface LLMConfig {
  provider: LLMProvider;
  baseUrl: string;
  model: string;
  apiKey: string | undefined;
}

export interface AIConfig {
  env: AppEnv;
  embedding: EmbeddingConfig;
  llm: LLMConfig;
}

// Available local embedding models via LM Studio (Qwen3-Embedding family)
// Switch by setting LMSTUDIO_EMBEDDING_MODEL in your .env
//
// | Model                                    | Params | Max Dimensions | VRAM   |
// |------------------------------------------|--------|----------------|--------|
// | text-embedding-qwen3-embedding-0.6b      | 0.6B   | 1024           | ~2 GB  |
// | text-embedding-qwen3-embedding-4b        | 4B     | 2048           | ~8 GB  |
// | text-embedding-qwen3-embedding-8b        | 8B     | 4096           | ~16 GB |
//
// Recommended: 0.6B for local dev (fast, low resource, competitive quality)

function getAppEnv(): AppEnv {
  const env = process.env.APP_ENV || 'production';
  return env === 'local' ? 'local' : 'production';
}

function getLocalEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.EMBEDDING_PROVIDER?.toLowerCase();
  if (provider === 'lmstudio') return 'lmstudio';
  return 'ollama'; // default for local
}

function getEmbeddingConfig(appEnv: AppEnv): EmbeddingConfig {
  if (appEnv === 'local') {
    const provider = getLocalEmbeddingProvider();

    if (provider === 'ollama') {
      return {
        provider: 'ollama',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
        model: process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:0.6b',
        dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1024', 10),
        apiKey: undefined, // Ollama requires no auth
        maxInputLength: parseInt(process.env.EMBEDDING_MAX_INPUT_LENGTH || '8192', 10),
      };
    }

    // LM Studio
    return {
      provider: 'lmstudio',
      baseUrl: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
      model: process.env.LMSTUDIO_EMBEDDING_MODEL || 'text-embedding-qwen3-embedding-0.6b',
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1024', 10),
      apiKey: process.env.LMSTUDIO_API_KEY || 'lm-studio',
      maxInputLength: parseInt(process.env.EMBEDDING_MAX_INPUT_LENGTH || '8192', 10),
    };
  }

  return {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002',
    dimensions: 1536,
    apiKey: process.env.OPENAI_API_KEY,
    maxInputLength: 8191,
  };
}

function getLLMConfig(_appEnv: AppEnv): LLMConfig {
  // OpenRouter is used in both local and production environments.
  // It's the only external service required for local dev.
  return {
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    apiKey: process.env.OPENROUTER_API_KEY,
  };
}

export function getAIConfig(): AIConfig {
  const appEnv = getAppEnv();
  return {
    env: appEnv,
    embedding: getEmbeddingConfig(appEnv),
    llm: getLLMConfig(appEnv),
  };
}

/**
 * Returns the embedding API URL for the /embeddings endpoint.
 * Use this in n8n workflows or server-side code.
 */
export function getEmbeddingEndpoint(): string {
  const config = getAIConfig();
  return `${config.embedding.baseUrl}/embeddings`;
}

/**
 * Returns headers for the embedding API request.
 */
export function getEmbeddingHeaders(): Record<string, string> {
  const config = getAIConfig();
  return {
    'Content-Type': 'application/json',
    ...(config.embedding.apiKey
      ? { Authorization: `Bearer ${config.embedding.apiKey}` }
      : {}),
  };
}
