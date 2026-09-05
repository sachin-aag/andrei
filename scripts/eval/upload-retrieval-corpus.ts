import { config } from "dotenv";
import { buildRetrievalCorpus } from "./retrieval-corpus";
import { uploadRetrievalCorpus } from "./retrieval-gcs";

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main(): Promise<void> {
  const files = await buildRetrievalCorpus();
  await uploadRetrievalCorpus(files);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
