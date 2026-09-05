import { afterEach, describe, expect, it, vi } from "vitest";
import {
  retrievalEvalGcsBucket,
  retrievalEvalGcsPrefix,
} from "./retrieval-gcs";
import { RETRIEVAL_EVAL_GCS_PREFIX } from "./retrieval-corpus";

describe("retrieval eval GCS helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers RETRIEVAL_EVAL_GCS_BUCKET over GCS_BUCKET", () => {
    vi.stubEnv("RETRIEVAL_EVAL_GCS_BUCKET", "eval-bucket");
    vi.stubEnv("GCS_BUCKET", "prod-bucket");
    expect(retrievalEvalGcsBucket()).toBe("eval-bucket");
  });

  it("falls back to GCS_BUCKET", () => {
    vi.stubEnv("RETRIEVAL_EVAL_GCS_BUCKET", "");
    vi.stubEnv("GCS_BUCKET", "prod-bucket");
    expect(retrievalEvalGcsBucket()).toBe("prod-bucket");
  });

  it("throws when neither bucket is set", () => {
    vi.stubEnv("RETRIEVAL_EVAL_GCS_BUCKET", "");
    vi.stubEnv("GCS_BUCKET", "");
    expect(() => retrievalEvalGcsBucket()).toThrow(/RETRIEVAL_EVAL_GCS_BUCKET/);
  });

  it("defaults the prefix and normalizes a trailing slash", () => {
    vi.stubEnv("RETRIEVAL_EVAL_GCS_PREFIX", "");
    expect(retrievalEvalGcsPrefix()).toBe(RETRIEVAL_EVAL_GCS_PREFIX);
    vi.stubEnv("RETRIEVAL_EVAL_GCS_PREFIX", "custom-prefix");
    expect(retrievalEvalGcsPrefix()).toBe("custom-prefix/");
  });
});
