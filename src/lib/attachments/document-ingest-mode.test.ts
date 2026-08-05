import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDocumentIngestMode } from "@/lib/attachments/document-ingest-mode";

describe("resolveDocumentIngestMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("honors DOCUMENT_INGEST_MODE override", () => {
    vi.stubEnv("DOCUMENT_INGEST_MODE", "workflow");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(resolveDocumentIngestMode()).toBe("workflow");

    vi.stubEnv("DOCUMENT_INGEST_MODE", "inline");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(resolveDocumentIngestMode()).toBe("inline");
  });

  it("defaults preview to inline and other envs to workflow", () => {
    vi.stubEnv("DOCUMENT_INGEST_MODE", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(resolveDocumentIngestMode()).toBe("inline");

    vi.stubEnv("VERCEL_ENV", "production");
    expect(resolveDocumentIngestMode()).toBe("workflow");

    vi.stubEnv("VERCEL_ENV", "");
    expect(resolveDocumentIngestMode()).toBe("workflow");
  });
});
