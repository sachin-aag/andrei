import { describe, expect, it } from "vitest";
import { documentTypeEnum } from "@/db/schema";
import { loadSectionEditors } from "./section-editor-loaders";

describe("loadSectionEditors", () => {
  it("has a loader for every registered document type", () => {
    for (const documentType of documentTypeEnum.enumValues) {
      const pending = loadSectionEditors(documentType);
      void pending.catch(() => {});
      expect(pending).toBeInstanceOf(Promise);
    }
  });
});
