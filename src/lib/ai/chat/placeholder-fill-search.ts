import type { SectionContentMap } from "@/types/sections";
import {
  PLACEHOLDER_FILL_MAX_HITS,
  PLACEHOLDER_FILL_PER_QUERY_LIMIT,
  placeholderFillQueries,
  type PlaceholderFillHit,
} from "@/lib/ai/chat/placeholder-fill";
import { searchReportDocumentsMany } from "@/lib/attachments/retrieval";

export async function searchPlaceholderFill(input: {
  reportId: string;
  sections: Partial<SectionContentMap> | Partial<Record<string, unknown>>;
  attachmentIds?: readonly string[];
}): Promise<{ queries: string[]; hits: PlaceholderFillHit[] }> {
  const planned = placeholderFillQueries(input.sections);
  const queries = planned.map((item) => item.query);
  if (queries.length === 0) return { queries: [], hits: [] };

  try {
    const arms = await searchReportDocumentsMany({
      reportId: input.reportId,
      queries,
      limit: PLACEHOLDER_FILL_PER_QUERY_LIMIT,
      attachmentIds: input.attachmentIds,
      backfill: input.attachmentIds === undefined,
    });
    const byId = new Map<string, PlaceholderFillHit>();
    for (const arm of arms) {
      for (const hit of arm) {
        if (byId.has(hit.citationId)) continue;
        byId.set(hit.citationId, {
          attachmentId: hit.attachmentId,
          filename: hit.filename,
          pageNumber: hit.pageNumber,
          text: hit.text,
          quote: hit.quote,
          citationId: hit.citationId,
          sourceSha256: hit.sourceSha256,
        });
        if (byId.size >= PLACEHOLDER_FILL_MAX_HITS) {
          return { queries, hits: Array.from(byId.values()) };
        }
      }
    }
    return { queries, hits: Array.from(byId.values()) };
  } catch (err) {
    console.error("chat: placeholder-fill retrieval failed", err);
    return { queries, hits: [] };
  }
}
