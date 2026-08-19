import { afterEach, describe, expect, it } from "vitest";
import { formatIngestPageLabel } from "./ingest-continue-limits";
import {
  ingestContinueOrigin,
  mintIngestContinueToken,
  verifyIngestContinueToken,
} from "./ingest-continue";

describe("ingest continue token", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("round-trips a signed payload", () => {
    process.env.AUTH_SECRET = "test-secret-for-ingest-continue";
    const token = mintIngestContinueToken({
      attachmentId: "att_1",
      generation: "gen_9",
      slice: 2,
    });
    expect(verifyIngestContinueToken(token)).toEqual({
      attachmentId: "att_1",
      generation: "gen_9",
      slice: 2,
    });
    expect(verifyIngestContinueToken("not-a-token")).toBeNull();
  });

  it("prefers this Vercel deployment over AUTH_URL", () => {
    process.env.VERCEL_URL = "andrei-demo-abc.vercel.app";
    process.env.AUTH_URL = "https://demo.andreihealth.com";
    expect(ingestContinueOrigin()).toBe("https://andrei-demo-abc.vercel.app");
  });
});

describe("formatIngestPageLabel", () => {
  it("shows the first page of the current batch", () => {
    expect(formatIngestPageLabel(4)).toBe("Page 4");
    expect(formatIngestPageLabel(null)).toBeNull();
    expect(formatIngestPageLabel(0)).toBeNull();
  });
});
