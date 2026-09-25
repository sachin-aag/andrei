import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPdfIngestConfigured } from "@/lib/attachments/document-ai-ocr";
import { readPdfTextLayer } from "@/lib/attachments/pdf-text-layer";
import {
  CORPUS_ANCHORS,
  PROTOCOL_EQUIPMENT_FILENAME,
  PROTOCOL_PAGES,
  REQUIRED_EQUIPMENT_HEADER_LINES,
  SOFTWARE_REQUIREMENTS_FILENAME,
  SOFTWARE_PAGES,
  assertCorpusAnchors,
  buildRetrievalCorpus,
} from "./retrieval-corpus";

describe("retrieval eval corpus", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("embeds the anchors a live search must recover", async () => {
    const files = await buildRetrievalCorpus();
    await expect(assertCorpusAnchors(files)).resolves.toBeUndefined();
    expect(files.map((file) => file.filename)).toEqual([
      PROTOCOL_EQUIPMENT_FILENAME,
      SOFTWARE_REQUIREMENTS_FILENAME,
    ]);
  });

  it("hides the required-equipment row in a 900-character prefix of page 2", async () => {
    const files = await buildRetrievalCorpus();
    const protocol = files.find(
      (file) => file.filename === PROTOCOL_EQUIPMENT_FILENAME
    );
    expect(protocol).toBeDefined();
    const layer = await readPdfTextLayer(protocol!.bytes);
    const page = layer.pages.find(
      (entry) => entry.pageNumber === PROTOCOL_PAGES.requiredEquipment
    );
    expect(page).toBeDefined();
    const collapsed = page!.text.replace(/\s+/g, " ").trim();
    expect(collapsed).toContain(CORPUS_ANCHORS.spectrumAnalyzer);
    expect(collapsed).toContain(CORPUS_ANCHORS.narda);
    expect(collapsed.slice(0, 900)).not.toContain(
      CORPUS_ANCHORS.spectrumAnalyzer
    );
    expect(REQUIRED_EQUIPMENT_HEADER_LINES).toBeGreaterThanOrEqual(15);
  });

  it("keeps SW-EVAL-7 off the protocol PDF", async () => {
    const files = await buildRetrievalCorpus();
    const protocol = files.find(
      (file) => file.filename === PROTOCOL_EQUIPMENT_FILENAME
    );
    const software = files.find(
      (file) => file.filename === SOFTWARE_REQUIREMENTS_FILENAME
    );
    const protocolLayer = await readPdfTextLayer(protocol!.bytes);
    const softwareLayer = await readPdfTextLayer(software!.bytes);
    const protocolText = protocolLayer.pages.map((page) => page.text).join(" ");
    const softwarePage = softwareLayer.pages.find(
      (page) => page.pageNumber === SOFTWARE_PAGES.requirements
    );
    expect(protocolText).not.toContain(CORPUS_ANCHORS.swEval7);
    expect(softwarePage?.text).toContain(CORPUS_ANCHORS.swEval7);
    expect(softwarePage?.text).toContain(CORPUS_ANCHORS.interlock);
    expect(softwarePage?.text).toContain(CORPUS_ANCHORS.pmcPr014);
    expect(protocolText).not.toContain(CORPUS_ANCHORS.pmcPr014);
  });

  it("indexes generated PDFs without Document AI so stale-GCS CI can ingest", async () => {
    vi.stubEnv("GOOGLE_VERTEX_PROJECT", "eval-project");
    vi.stubEnv("DOCUMENT_AI_PROCESSOR_ID", "");
    vi.stubEnv("DOCUMENT_AI_LOCATION", "");
    const files = await buildRetrievalCorpus();
    await expect(
      Promise.all(files.map((file) => assertPdfIngestConfigured(file.bytes)))
    ).resolves.toHaveLength(files.length);
  });
});
