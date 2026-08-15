import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  docxBufferToPreviewHtml,
  openAnchorsInNewTab,
} from "@/lib/attachments/docx-preview";

const docxFixture = path.join(
  process.cwd(),
  "docs",
  "sample_files",
  "Investigation  DEV-PK-25-002.docx"
);

describe("openAnchorsInNewTab", () => {
  it("adds target=_blank and rel to external anchors", () => {
    const html = openAnchorsInNewTab(
      `<p>See <a href="https://example.com/path">docs</a> and <a href='http://example.org'>here</a>.</p>`
    );
    expect(html).toContain(
      `<a href="https://example.com/path" target="_blank" rel="noopener noreferrer">`
    );
    expect(html).toContain(
      `<a href='http://example.org' target="_blank" rel="noopener noreferrer">`
    );
  });

  it("leaves in-document fragment links alone", () => {
    const html = openAnchorsInNewTab(`<a href="#section-2">Jump</a>`);
    expect(html).toBe(`<a href="#section-2">Jump</a>`);
  });

  it("replaces an existing target/rel so links always escape the preview", () => {
    const html = openAnchorsInNewTab(
      `<a href="https://example.com" target="_self" rel="nofollow">x</a>`
    );
    expect(html).toBe(
      `<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>`
    );
  });
});

describe("docxBufferToPreviewHtml", () => {
  it("renders a self-contained HTML document with the converted body", async () => {
    const buffer = fs.readFileSync(docxFixture);
    const html = await docxBufferToPreviewHtml(buffer, { title: "My Report.docx" });

    expect(html.startsWith("<!doctype html")).toBe(true);
    expect(html).toContain("<body>");
    // Body carries converted content (mammoth emits paragraphs for a real doc).
    expect(html).toMatch(/<p>|<h[1-6]>|<table>/);
    // No external resources — safe for a strict CSP / sandboxed iframe.
    expect(html).not.toMatch(/<script/i);
  });

  it("escapes the title to prevent markup injection via the filename", async () => {
    const buffer = fs.readFileSync(docxFixture);
    const html = await docxBufferToPreviewHtml(buffer, {
      title: '<img src=x onerror=alert(1)>.docx',
    });
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;.docx");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
  });
});
