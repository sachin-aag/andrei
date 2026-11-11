import type { ChatDraftAblationReport } from "@/lib/eval/chat-draft-ablation";
import type { RetrievalAblationReport } from "@/lib/eval/retrieval-ablation";
import type { SearchBeforeWriteReport } from "@/lib/eval/search-before-write";

export type AndreiBenchAblation = {
  persist: ChatDraftAblationReport;
  retrieval: RetrievalAblationReport;
  searchBeforeWrite: SearchBeforeWriteReport;
};

export function formatAndreiBenchScoreboard(
  bench: AndreiBenchAblation
): string {
  const { persist, retrieval, searchBeforeWrite } = bench;
  return [
    `======== Andrei Bench ${persist.benchVersion} ========`,
    `correct persist            Andrei on ${String(persist.correctPersistOn)}/${String(persist.n)}   Andrei off ${String(persist.correctPersistOff)}/${String(persist.n)}`,
    `right page + excerpt       Andrei on ${String(retrieval.correctOn)}/${String(retrieval.n)}   Andrei off ${String(retrieval.correctOff)}/${String(retrieval.n)}`,
    `looked before writing      Andrei on ${String(searchBeforeWrite.correctOn)}/${String(searchBeforeWrite.n)}   Andrei off ${String(searchBeforeWrite.correctOff)}/${String(searchBeforeWrite.n)}`,
    "Do not average these. Persist is the GxP-record slide. Retrieval is a separate eval. Search-before-write is the policy lock on 6 of the 20 floor cases — not a Gemini run, not on the persist slide. Same-model Gemini/base is `pnpm chat-eval -- --live`.",
  ].join("\n");
}
