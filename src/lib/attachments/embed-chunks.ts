import { createVertex } from "@ai-sdk/google-vertex";
import { embedMany, type EmbeddingModel } from "ai";
import { createWifAuthClient, getWifConfig } from "@/lib/gcp/wif-token";

export const DEFAULT_DOCUMENT_EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const DOCUMENT_EMBEDDING_DIMENSIONS = 768;
export const DOCUMENT_EMBEDDING_TASK_TYPE = "RETRIEVAL_DOCUMENT";

type GoogleAuthOptions = NonNullable<Parameters<typeof createVertex>[0]>["googleAuthOptions"];
type AuthClient = NonNullable<NonNullable<GoogleAuthOptions>["authClient"]>;

const EMBEDDING_BATCH_SIZE = 32;
const vertexProviderByLocation = new Map<string, ReturnType<typeof createVertex>>();

export async function embedDocumentChunks(input: {
  texts: string[];
  modelId: string;
}): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let index = 0; index < input.texts.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = input.texts.slice(index, index + EMBEDDING_BATCH_SIZE);
    const result = await embedMany({
      model: resolveDocumentEmbeddingModel(input.modelId),
      values: batch,
      providerOptions: {
        googleVertex: {
          taskType: DOCUMENT_EMBEDDING_TASK_TYPE,
          outputDimensionality: DOCUMENT_EMBEDDING_DIMENSIONS,
        },
      },
    });
    embeddings.push(...result.embeddings.map(normalizeEmbedding));
  }
  return embeddings;
}

function resolveDocumentEmbeddingModel(modelId: string): EmbeddingModel {
  const project = process.env.GOOGLE_VERTEX_PROJECT?.trim();
  if (!project) {
    throw new Error(
      "GOOGLE_VERTEX_PROJECT is required for document embeddings. Document content embeddings only use Vertex AI."
    );
  }

  const location =
    process.env.DOCUMENT_EMBEDDING_LOCATION?.trim() ||
    process.env.GOOGLE_VERTEX_LOCATION?.trim() ||
    "us-central1";
  const cached = vertexProviderByLocation.get(location);
  if (cached) return cached.textEmbeddingModel(modelId);

  const wifConfig = getWifConfig();
  const provider = wifConfig
    ? createVertex({
        project,
        location,
        googleAuthOptions: {
          authClient: createWifAuthClient(wifConfig) as unknown as AuthClient,
        },
      })
    : createVertex({ project, location });
  vertexProviderByLocation.set(location, provider);
  return provider.textEmbeddingModel(modelId);
}

function normalizeEmbedding(values: number[]): number[] {
  const padded =
    values.length === DOCUMENT_EMBEDDING_DIMENSIONS
      ? values
      : Array.from({ length: DOCUMENT_EMBEDDING_DIMENSIONS }, (_value, index) =>
          Number.isFinite(values[index]) ? values[index] : 0
        );
  const magnitude = Math.sqrt(
    padded.reduce((sum, value) => sum + value * value, 0)
  );
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return padded.map(() => 0);
  }
  return padded.map((value) => value / magnitude);
}
