import { describe, expect, it } from "vitest";
import {
  isPostMjMainMigrationTag,
  tagsToStampOnEmptyPushJournal,
} from "@/lib/db/push-baseline-tags";

describe("push-baseline tags", () => {
  const journalTags = [
    "0029_part11_gap_closure",
    "0031_chat_messages",
    "0037_document_types",
    "0038_attachments",
  ];
  const extraTags = ["0030_conclusion_section"];

  it("stamps the full journal when document_no already exists", () => {
    expect(
      tagsToStampOnEmptyPushJournal({
        journalTags,
        extraTags,
        hasDocumentNoColumn: true,
      })
    ).toEqual([...journalTags, ...extraTags]);
  });

  it("leaves 0030+ unstamped on a pre-cutover MJ schema", () => {
    expect(
      tagsToStampOnEmptyPushJournal({
        journalTags,
        extraTags,
        hasDocumentNoColumn: false,
      })
    ).toEqual(["0029_part11_gap_closure"]);
  });

  it("does not stamp tags after 0037 when document_no is missing", () => {
    const stamped = tagsToStampOnEmptyPushJournal({
      journalTags: ["0029_part11_gap_closure", "0038_later"],
      extraTags: ["0030_conclusion_section"],
      hasDocumentNoColumn: false,
    });
    expect(stamped).toEqual(["0029_part11_gap_closure"]);
    expect(stamped).not.toContain("0038_later");
  });

  it("recognizes every 0030-0037 tag", () => {
    expect(isPostMjMainMigrationTag("0030_conclusion_section")).toBe(true);
    expect(isPostMjMainMigrationTag("0036_attachment_description")).toBe(true);
    expect(isPostMjMainMigrationTag("0037_document_types")).toBe(true);
    expect(isPostMjMainMigrationTag("0038_attachments")).toBe(false);
    expect(isPostMjMainMigrationTag("0029_part11_gap_closure")).toBe(false);
  });
});
