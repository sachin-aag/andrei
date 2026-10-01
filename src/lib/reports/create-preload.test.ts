import { describe, expect, it } from "vitest";
import {
  CREATE_PRELOAD_DOCUMENT_NO_PREFIX,
  createPreloadDocumentNo,
  isCreatePreloadDocumentNo,
  isCreatePreloadMetadata,
  stripCreatePreloadMetadata,
} from "./create-preload";

describe("create-preload", () => {
  it("builds a reserved document number from the report id", () => {
    expect(createPreloadDocumentNo("abc")).toBe(
      `${CREATE_PRELOAD_DOCUMENT_NO_PREFIX}abc`
    );
    expect(isCreatePreloadDocumentNo("__preload_abc")).toBe(true);
    expect(isCreatePreloadDocumentNo("DEV-001")).toBe(false);
  });

  it("recognizes preload metadata", () => {
    expect(isCreatePreloadMetadata({ createPreload: true })).toBe(true);
    expect(isCreatePreloadMetadata({ createPreload: false })).toBe(false);
    expect(isCreatePreloadMetadata({})).toBe(false);
    expect(isCreatePreloadMetadata(null)).toBe(false);
  });

  it("strips the preload flag without dropping type metadata", () => {
    expect(
      stripCreatePreloadMetadata({
        createPreload: true,
        revision: "A",
        productName: "Solea",
      })
    ).toEqual({ revision: "A", productName: "Solea" });
    expect(stripCreatePreloadMetadata({})).toEqual({});
  });
});
