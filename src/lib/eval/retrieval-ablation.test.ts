import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRetrievalCases } from "@/lib/attachments/retrieval-metrics";
import { formatAndreiBenchScoreboard } from "@/lib/eval/andrei-bench";
import { ablateGroundDraftCases } from "@/lib/eval/chat-draft-ablation";
import { parseChatDraftCases } from "@/lib/eval/chat-draft-cases";
import {
  ablateRetrievalCases,
  formatRetrievalAblationReport,
} from "@/lib/eval/retrieval-ablation";
import { ablateSearchBeforeWrite } from "@/lib/eval/search-before-write";
import { loadRetrievalCorpusPages } from "../../../scripts/eval/retrieval-corpus";

const casesPath = path.join(
  process.cwd(),
  "scripts/eval/retrieval-cases.json"
);

describe("ablateRetrievalCases", () => {
  it("opens the right page and shows the row with Andrei on, and loses the cover-magnet / header-prefix cases with Andrei off", async () => {
    const cases = parseRetrievalCases(
      JSON.parse(readFileSync(casesPath, "utf8"))
    );
    const pages = await loadRetrievalCorpusPages();
    const report = ablateRetrievalCases({ cases, pages });

    expect(report.n).toBe(cases.length);
    expect(report.n).toBe(12);
    expect(report.excerptN).toBe(10);
    expect(report.correctOn).toBe(12);
    expect(report.correctOff).toBe(8);
    expect(report.rightPageOn).toBe(12);
    expect(report.rightPageOff).toBe(12);
    expect(report.rightExcerptOn).toBe(10);
    expect(report.rightExcerptOff).toBe(6);

    const coverMagnet = report.rows.find(
      (row) => row.id === "equipment-system-report-cover-magnet"
    );
    expect(coverMagnet?.excerptApplicable).toBe(true);
    expect(coverMagnet?.on.correct).toBe(true);
    expect(coverMagnet?.off.rightExcerpt).toBe(false);

    const page2 = report.rows.find((row) => row.id === "equipment-page-2-locator");
    expect(page2?.on.rightExcerpt).toBe(true);
    expect(page2?.off.rightExcerpt).toBe(false);

    const urs3 = report.rows.find((row) => row.id === "urs-3-recovered-minus");
    expect(urs3?.excerptApplicable).toBe(false);
    expect(urs3?.on.rightPage).toBe(true);

    const printed = formatRetrievalAblationReport(report);
    expect(printed).toContain("right page + excerpt");
    expect(printed).toContain("Andrei on 12/12   Andrei off 8/12");
    expect(printed).toContain("Wrong page never gets to persist");
    expect(printed).not.toContain("persist-gate");

    const floor = parseChatDraftCases(
      JSON.parse(
        readFileSync(
          path.join(process.cwd(), "scripts/eval/chat-draft-cases.json"),
          "utf8"
        )
      )
    );
    const scoreboard = formatAndreiBenchScoreboard({
      persist: ablateGroundDraftCases(floor),
      retrieval: report,
      searchBeforeWrite: ablateSearchBeforeWrite(floor),
    });
    expect(scoreboard).toContain("correct persist            Andrei on 14/14   Andrei off 8/14");
    expect(scoreboard).toContain("right page + excerpt       Andrei on 12/12   Andrei off 8/12");
    expect(scoreboard).toContain("looked before writing      Andrei on 6/6   Andrei off 1/6");
    expect(scoreboard).toContain("not on the persist slide");
  });
});
