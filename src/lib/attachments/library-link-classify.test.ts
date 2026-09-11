import { describe, expect, it } from "vitest";
import { classifyAssetsForLibraryLink } from "./library-link-classify";

const assets = [{ id: "live" }, { id: "tombstone" }, { id: "fresh" }];

describe("classifyAssetsForLibraryLink", () => {
  it("skips live links, restores tombstones, and inserts new assets", () => {
    expect(
      classifyAssetsForLibraryLink(assets, [
        { id: "att-live", assetId: "live", deletedAt: null },
        {
          id: "att-old",
          assetId: "tombstone",
          deletedAt: "2026-09-01T00:00:00.000Z",
        },
      ])
    ).toEqual({
      skip: [{ id: "live" }],
      restore: [{ asset: { id: "tombstone" }, attachmentId: "att-old" }],
      insert: [{ id: "fresh" }],
    });
  });

  it("treats every selected asset as new when the report has no rows", () => {
    expect(classifyAssetsForLibraryLink(assets, [])).toEqual({
      skip: [],
      restore: [],
      insert: assets,
    });
  });

  it("ignores legacy attachment rows with no vault asset id", () => {
    expect(
      classifyAssetsForLibraryLink([{ id: "fresh" }], [
        { id: "legacy", assetId: null, deletedAt: null },
      ])
    ).toEqual({
      skip: [],
      restore: [],
      insert: [{ id: "fresh" }],
    });
  });
});
