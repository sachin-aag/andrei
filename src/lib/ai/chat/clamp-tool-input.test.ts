import { describe, expect, it } from "vitest";
import {
  clampToolInputToSchema,
  repairToolInputAgainstSchema,
  type ToolJsonSchema,
} from "./clamp-tool-input";

const SEARCH_DOCUMENTS_SCHEMA: ToolJsonSchema = {
  type: "object",
  properties: {
    query: { type: "string", minLength: 1, maxLength: 500 },
    queries: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
    limit: { type: "integer", minimum: 1, maximum: 16 },
    mode: { type: "string", enum: ["hybrid", "keyword"] },
    excludePages: {
      type: "array",
      maxItems: 80,
      items: {
        type: "object",
        properties: {
          attachmentId: { type: "string", minLength: 1 },
          pageNumber: { type: "integer", minimum: 1 },
        },
      },
    },
  },
};

describe("clampToolInputToSchema", () => {
  it("clamps the Vercel incident payload to the advertised bounds", () => {
    const clamped = clampToolInputToSchema(
      {
        limit: 20,
        queries: Array.from({ length: 12 }, (_, i) => `"M3-HRS-${i}"`),
        mode: "keyword",
      },
      SEARCH_DOCUMENTS_SCHEMA
    ) as { limit: number; queries: string[]; mode: string };

    expect(clamped.limit).toBe(16);
    expect(clamped.queries).toHaveLength(8);
    expect(clamped.mode).toBe("keyword");
  });

  it("truncates an over-long string to maxLength", () => {
    const clamped = clampToolInputToSchema(
      { query: "x".repeat(900) },
      SEARCH_DOCUMENTS_SCHEMA
    ) as { query: string };
    expect(clamped.query).toHaveLength(500);
  });

  it("wraps a bare value where the schema expects an array", () => {
    const clamped = clampToolInputToSchema(
      { queries: "UUT serial numbers" },
      SEARCH_DOCUMENTS_SCHEMA
    ) as { queries: string[] };
    expect(clamped.queries).toEqual(["UUT serial numbers"]);
  });

  it("parses a numeric string into an in-range integer", () => {
    const clamped = clampToolInputToSchema(
      { limit: "40" },
      SEARCH_DOCUMENTS_SCHEMA
    ) as { limit: number };
    expect(clamped.limit).toBe(16);
  });

  it("drops an unknown enum value and case-corrects a known one", () => {
    const dropped = clampToolInputToSchema(
      { mode: "lexical" },
      SEARCH_DOCUMENTS_SCHEMA
    ) as Record<string, unknown>;
    expect(dropped.mode).toBeUndefined();

    const corrected = clampToolInputToSchema(
      { mode: "Keyword" },
      SEARCH_DOCUMENTS_SCHEMA
    ) as { mode: string };
    expect(corrected.mode).toBe("keyword");
  });

  it("clamps nested arrays of objects", () => {
    const pages = Array.from({ length: 120 }, (_, i) => ({
      attachmentId: "att_1",
      pageNumber: i + 1,
    }));
    const clamped = clampToolInputToSchema(
      { excludePages: pages },
      SEARCH_DOCUMENTS_SCHEMA
    ) as { excludePages: unknown[] };
    expect(clamped.excludePages).toHaveLength(80);
  });

  it("leaves unknown properties and untyped nodes alone", () => {
    const clamped = clampToolInputToSchema(
      { query: "UUT", somethingElse: { nested: true } },
      SEARCH_DOCUMENTS_SCHEMA
    ) as Record<string, unknown>;
    expect(clamped.somethingElse).toEqual({ nested: true });
  });
});

describe("repairToolInputAgainstSchema", () => {
  it("returns clamped JSON for an out-of-bounds call", () => {
    const repaired = repairToolInputAgainstSchema(
      JSON.stringify({ limit: 20, queries: ["a", "b"], mode: "keyword" }),
      SEARCH_DOCUMENTS_SCHEMA
    );
    expect(repaired).not.toBeNull();
    expect(JSON.parse(repaired as string)).toMatchObject({ limit: 16 });
  });

  it("returns null when the input already satisfies the schema", () => {
    expect(
      repairToolInputAgainstSchema(
        JSON.stringify({ limit: 8, query: "UUT" }),
        SEARCH_DOCUMENTS_SCHEMA
      )
    ).toBeNull();
  });

  it("returns null for malformed JSON rather than guessing", () => {
    expect(repairToolInputAgainstSchema("{", SEARCH_DOCUMENTS_SCHEMA)).toBeNull();
  });

  it("returns null without a schema", () => {
    expect(repairToolInputAgainstSchema('{"limit":20}', undefined)).toBeNull();
  });
});
