import { describe, expect, it, vi } from "vitest";

// Catalog wires runners that import persist → `@/db` (DATABASE_URL at import).
vi.mock("@/db", () => ({ db: {} }));

import { documentTypeEnum } from "@/db/schema";
import { checksForDocumentType } from "@/lib/review/catalog";
import { STATIC_REVIEW_CHECK_IDS } from "@/lib/review/types";
import { fdaCriteriaForDocumentType } from "@/lib/review/fda-criteria";

describe("review catalog", () => {
  it("gives every check an appliesTo match on at least one document type", () => {
    const types = documentTypeEnum.enumValues;
    const seen = new Set<string>();
    for (const type of types) {
      for (const check of checksForDocumentType(type)) {
        expect(check.appliesTo(type)).toBe(true);
        seen.add(check.id);
      }
    }
    for (const id of STATIC_REVIEW_CHECK_IDS) {
      expect(seen.has(id)).toBe(true);
    }
  });

  it("declares FDA criteria for every non-generic document type", () => {
    for (const type of documentTypeEnum.enumValues) {
      if (type === "generic_document") {
        expect(fdaCriteriaForDocumentType(type)).toEqual([]);
        expect(
          checksForDocumentType(type).some((check) => check.category === "fda")
        ).toBe(false);
        continue;
      }
      const fda = fdaCriteriaForDocumentType(type);
      expect(fda.length).toBeGreaterThan(0);
      expect(fda.every((row) => row.key.startsWith("fda."))).toBe(true);
    }
  });

  it("keeps Citations and Writing on generic documents", () => {
    const ids = checksForDocumentType("generic_document").map((check) => check.id);
    expect(ids).toContain("citations.resolves");
    expect(ids).toContain("writing.grammar");
    expect(ids.some((id) => id.startsWith("report.criteria."))).toBe(false);
  });
});
