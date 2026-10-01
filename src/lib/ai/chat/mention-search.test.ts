import { describe, expect, it } from "vitest";
import {
  applyMentionToInput,
  filterMentionCandidates,
  findMentionQuery,
  mentionQueryContinuesPastCompletedTag,
  syncMentionCandidateLabels,
  type MentionCandidate,
} from "@/lib/ai/chat/mention-search";

const candidates: MentionCandidate[] = [
  { type: "document", id: "att_1", label: "batch-coa.pdf" },
  { type: "document", id: "att_2", label: "cleaning log 2024.pdf" },
  { type: "section", id: "analyze", label: "Analyze" },
  { type: "section", id: "measure", label: "Measure" },
];

describe("findMentionQuery", () => {
  it("finds the token the caret sits in", () => {
    const text = "check @batch";
    expect(findMentionQuery(text, text.length)).toEqual({
      query: "batch",
      start: 6,
      end: 12,
    });
  });

  it("opens on a bare @ so the full list shows", () => {
    expect(findMentionQuery("@", 1)).toEqual({ query: "", start: 0, end: 1 });
  });

  it("ignores an @ that does not start a word", () => {
    const text = "mail me at bhargav@mjbiopharm.com";
    expect(findMentionQuery(text, text.length)).toBeNull();
  });

  it("allows spaces so multi-word filenames stay searchable", () => {
    const text = "@cleaning log";
    expect(findMentionQuery(text, text.length, candidates)?.query).toBe(
      "cleaning log"
    );
  });

  it("closes once the token crosses a newline", () => {
    const text = "@batch\nnext line";
    expect(findMentionQuery(text, text.length)).toBeNull();
  });

  it("returns null when there is no @ before the caret", () => {
    expect(findMentionQuery("no tags here", 5)).toBeNull();
  });

  it("stays open on an exact tag so the engineer can confirm", () => {
    const text = "check @Preventive Maintenance";
    expect(findMentionQuery(text, text.length, [
      { type: "section", id: "elr_preventive_maintenance", label: "Preventive Maintenance" },
    ])?.query).toBe("Preventive Maintenance");
  });

  it("closes after a completed tag plus more words instead of showing no matches", () => {
    const text = "can you check @Preventive Maintenance section and see";
    expect(
      findMentionQuery(text, text.length, [
        {
          type: "section",
          id: "elr_preventive_maintenance",
          label: "Preventive Maintenance",
        },
      ])
    ).toBeNull();
  });

  it("still searches a longer filename that starts with a shorter tag", () => {
    const overlapping: MentionCandidate[] = [
      { type: "section", id: "pm", label: "Preventive Maintenance" },
      { type: "document", id: "att_pm", label: "Preventive Maintenance Log" },
    ];
    expect(
      findMentionQuery("@Preventive Maintenance L", "@Preventive Maintenance L".length, overlapping)
        ?.query
    ).toBe("Preventive Maintenance L");
  });

  it("keeps an unmatched query open so the empty state can show", () => {
    expect(findMentionQuery("@nope", 5, candidates)?.query).toBe("nope");
  });
});

describe("filterMentionCandidates", () => {
  it("returns everything for an empty query", () => {
    expect(filterMentionCandidates(candidates, "")).toHaveLength(candidates.length);
  });

  it("ranks prefix matches ahead of substring matches", () => {
    const matches = filterMentionCandidates(candidates, "a");
    expect(matches[0]?.label).toBe("Analyze");
  });

  it("matches case-insensitively across documents and sections", () => {
    expect(filterMentionCandidates(candidates, "COA").map((c) => c.id)).toEqual([
      "att_1",
    ]);
    expect(filterMentionCandidates(candidates, "measure").map((c) => c.id)).toEqual([
      "measure",
    ]);
  });

  it("respects an explicit limit", () => {
    expect(filterMentionCandidates(candidates, "", 2)).toHaveLength(2);
  });

  it("does not cap matches when no limit is passed", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      type: "section" as const,
      id: `s${i}`,
      label: `Section ${i}`,
    }));
    expect(filterMentionCandidates(many, "section")).toHaveLength(12);
  });

  it("matches folder-path keywords so nested files stay searchable", () => {
    const nested: MentionCandidate[] = [
      {
        type: "document",
        id: "att_3",
        label: "jan.pdf",
        keywords: "SOPs / 2026",
      },
    ];
    expect(filterMentionCandidates(nested, "sops").map((c) => c.id)).toEqual([
      "att_3",
    ]);
  });
});

describe("syncMentionCandidateLabels", () => {
  it("updates chip labels when a sheet is renamed", () => {
    const mentions: MentionCandidate[] = [
      { type: "sheet", id: "sheet-1", label: "Data", sublabel: "1 column" },
    ];
    const candidates: MentionCandidate[] = [
      { type: "sheet", id: "sheet-1", label: "Fermenter A", sublabel: "3 columns" },
    ];

    expect(syncMentionCandidateLabels(mentions, candidates)).toEqual([
      { type: "sheet", id: "sheet-1", label: "Fermenter A", sublabel: "3 columns" },
    ]);
  });

  it("returns the same array reference when nothing changed", () => {
    const mentions: MentionCandidate[] = [
      { type: "sheet", id: "sheet-1", label: "Assay", sublabel: "2 columns" },
    ];
    const candidates: MentionCandidate[] = [...mentions];

    expect(syncMentionCandidateLabels(mentions, candidates)).toBe(mentions);
  });
});

describe("mentionQueryContinuesPastCompletedTag", () => {
  const elr: MentionCandidate[] = [
    {
      type: "section",
      id: "elr_preventive_maintenance",
      label: "Preventive Maintenance",
    },
  ];

  it("is false while the query still matches a tag", () => {
    expect(
      mentionQueryContinuesPastCompletedTag("Preventive Maintenance", elr)
    ).toBe(false);
  });

  it("is true once the engineer types past the matched tag", () => {
    expect(
      mentionQueryContinuesPastCompletedTag(
        "Preventive Maintenance section and see",
        elr
      )
    ).toBe(true);
  });

  it("is false for an unmatched token that is not a completed tag", () => {
    expect(mentionQueryContinuesPastCompletedTag("nope", elr)).toBe(false);
  });
});

describe("applyMentionToInput", () => {
  it("replaces the in-progress token and leaves the caret after it", () => {
    const text = "check @bat";
    const range = findMentionQuery(text, text.length)!;
    const result = applyMentionToInput(text, range, candidates[0]!);

    expect(result.text).toBe("check @batch-coa.pdf ");
    expect(result.caret).toBe(result.text.length);
  });

  it("preserves text after the caret", () => {
    const text = "see @bat for detail";
    const range = findMentionQuery(text, 8)!;
    const result = applyMentionToInput(text, range, candidates[0]!);

    expect(result.text).toBe("see @batch-coa.pdf  for detail");
  });

  it("closes the menu after a selected tag when typing continues", () => {
    const text = "check @Prev";
    const range = findMentionQuery(text, text.length)!;
    const inserted = applyMentionToInput(text, range, {
      type: "section",
      id: "elr_preventive_maintenance",
      label: "Preventive Maintenance",
    });
    const continued = `${inserted.text}section and see`;
    expect(
      findMentionQuery(continued, continued.length, [
        {
          type: "section",
          id: "elr_preventive_maintenance",
          label: "Preventive Maintenance",
        },
      ])
    ).toBeNull();
  });
});
