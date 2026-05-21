import fs from "node:fs";
import path from "node:path";

import type { SectionType } from "@/db/schema";
import type { ImportedReportContent } from "@/lib/import/docx-to-sections";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";
import {
  evaluateSection,
  buildCriterionEvaluationLlmPrompts,
  type AllSectionsContent,
} from "@/lib/ai/evaluate";
import { normalizeAnalyzeToolResults } from "@/lib/ai/evaluate-run-helpers";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import { hasEnoughContextInFirstSection } from "@/lib/ai/first-section-context";
import type { BulkEvalRow } from "@/lib/sample-eval/bulk-eval-aggregates";

export type ReportSectionLlmQuery = {
  section: SectionType;
  llmCalled: boolean;
  systemPrompt?: string;
  userPrompt?: string;
};

export type ReportRunOutcome = {
  sourcePath: string;
  sourceFile: string;
  deviationNo: string;
  anchorSlug: string;
  skippedReason: string | null;
  rows: BulkEvalRow[];
  sectionLlmQueries: ReportSectionLlmQuery[];
  allSections: AllSectionsContent;
};

/** Collect *.docx under dir (recursive depth-first). */
export function collectDocxFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && /\.docx$/i.test(e.name)) out.push(full);
    }
  }
  return out.sort();
}

export function reportAnchorSlug(basenameNoExt: string): string {
  const base =
    basenameNoExt
      .replace(/\.docx$/i, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "report";
  return `report-${base.toLowerCase()}`;
}

export function deviationNoFromBasename(originalName: string): string {
  return (
    originalName.replace(/\.docx$/i, "").replace(/_/g, " ").trim() ||
    originalName
  );
}

export async function evaluateOneDocx(
  absPath: string,
  reportDate: string
): Promise<ReportRunOutcome> {
  const buf = fs.readFileSync(absPath);
  const sourceFile = path.basename(absPath);
  const anchorSlug = reportAnchorSlug(path.basename(absPath, ".docx"));

  let imported: ImportedReportContent;
  try {
    imported = await docxBufferToImportedReportContent(buf);
  } catch (e) {
    return {
      sourcePath: absPath,
      sourceFile,
      deviationNo: deviationNoFromBasename(sourceFile),
      anchorSlug,
      skippedReason: `Import failed: ${e instanceof Error ? e.message : String(e)}`,
      rows: [],
      sectionLlmQueries: [],
      allSections: {},
    };
  }

  const deviationNo = deviationNoFromBasename(sourceFile);

  if (!hasEnoughContextInFirstSection(imported.sections.define)) {
    return {
      sourcePath: absPath,
      sourceFile,
      deviationNo,
      anchorSlug,
      skippedReason:
        "Define section lacks enough sentences to evaluate (needs at least two).",
      rows: [],
      sectionLlmQueries: [],
      allSections: {},
    };
  }

  const allSections: AllSectionsContent = {};
  for (const sk of EVALUATABLE_SECTIONS) {
    allSections[sk] = imported.sections[sk as keyof typeof imported.sections];
  }

  const sectionLlmQueries: ReportSectionLlmQuery[] = EVALUATABLE_SECTIONS.map(
    (sectionKey) => {
      const payload =
        imported.sections[sectionKey as keyof typeof imported.sections];
      const prompts = buildCriterionEvaluationLlmPrompts({
        section: sectionKey,
        content: payload,
        reportContext: { deviationNo, date: reportDate },
        allSections,
      });
      if (!prompts) {
        return { section: sectionKey, llmCalled: false };
      }
      return {
        section: sectionKey,
        llmCalled: true,
        systemPrompt: prompts.systemPrompt,
        userPrompt: prompts.userPrompt,
      };
    }
  );

  const sectionResults = await Promise.all(
    EVALUATABLE_SECTIONS.map(async (sectionKey) => {
      const payload =
        imported.sections[sectionKey as keyof typeof imported.sections];

      let evaluations = await evaluateSection({
        section: sectionKey,
        content: payload,
        reportContext: { deviationNo, date: reportDate },
        allSections,
      });

      if (sectionKey === "analyze") {
        evaluations = normalizeAnalyzeToolResults(
          payload as unknown,
          evaluations
        );
      }

      const rowsChunk: BulkEvalRow[] = evaluations.map((ev) => ({
        sourceFile,
        deviationNo,
        section: sectionKey,
        criterionKey: ev.criterionKey,
        criterionLabel: ev.criterionLabel,
        status: ev.status,
        reasoning: ev.reasoning,
      }));
      return rowsChunk;
    })
  );

  return {
    sourcePath: absPath,
    sourceFile,
    deviationNo,
    anchorSlug,
    skippedReason: null,
    rows: sectionResults.flat(),
    sectionLlmQueries,
    allSections,
  };
}
