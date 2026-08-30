import { describe, expect, it } from "vitest";
import { documentTypeEnum } from "@/db/schema";
import { getDocumentType } from "@/lib/document-types";
import { sectionLabel } from "./fields";

describe("sectionLabel", () => {
  it("uses registry titles for mechanical DV and QRA history", () => {
    expect(sectionLabel("revision_history")).toBe("Revision History");
    expect(sectionLabel("qra_revision_history")).toBe("Revision History");
    expect(sectionLabel("purpose_scope")).toBe("Purpose & Scope");
  });

  it("never returns an underscore for a registered section", () => {
    for (const type of documentTypeEnum.enumValues) {
      for (const section of getDocumentType(type).sections) {
        expect(sectionLabel(section.key), `${type}:${section.key}`).not.toContain(
          "_"
        );
      }
    }
  });
});
