import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import type { reports } from "@/db/schema";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { CHART_LOGICAL_HEIGHT, CHART_LOGICAL_WIDTH, renderChartPng } from "@/lib/charts/render-chart";
import {
  EMPTY_MECHANICAL_DV_CONTENT,
  MECHANICAL_DV_SECTION_KEYS,
} from "@/lib/document-types/mechanical/sections";
import { applyGoogleDocsImageCompat } from "@/lib/export/docx-google-docs-images";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { readPngDimensions } from "@/lib/export/raster-dimensions";
import type { ReportSectionRecord } from "@/types/report";
import { EMPTY_CONTENT, REPORT_SECTION_ROW_ORDER } from "@/types/sections";

function chartDoc(dataUrl: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Tip detachment torque:" },
          {
            type: "imageInline",
            attrs: {
              src: dataUrl,
              alt: TORQUE_MOCK_SPEC.title,
              width: 600,
              mediaId: null,
              chartSpec: TORQUE_MOCK_SPEC,
            },
          },
        ],
      },
    ],
  };
}

function pngFiles(zip: PizZip): Array<{ name: string; bytes: Buffer }> {
  return Object.keys(zip.files)
    .filter((name) => name.startsWith("word/media/") && name.endsWith(".png"))
    .map((name) => ({ name, bytes: zip.file(name)!.asNodeBuffer() }));
}

function chartPngInZip(zip: PizZip): { name: string; dims: { width: number; height: number } } | null {
  for (const file of pngFiles(zip)) {
    const dims = readPngDimensions(file.bytes);
    if (!dims) continue;
    const isChart =
      (dims.width === CHART_LOGICAL_WIDTH * 2 && dims.height === CHART_LOGICAL_HEIGHT * 2) ||
      (dims.width === CHART_LOGICAL_WIDTH && dims.height === CHART_LOGICAL_HEIGHT);
    if (isChart) return { name: file.name, dims };
  }
  return null;
}

async function renderedChartSrc(): Promise<string | null> {
  const result = await renderChartPng(TORQUE_MOCK_SPEC, { packId: "demo" });
  if ("error" in result) return null;
  return result.dataUrl;
}

describe("chart DOCX export", () => {
  it("embeds a mechanical observations chart as PNG and ignores chartSpec", async () => {
    const previous = {
      ANDREI_CUSTOMER: process.env.ANDREI_CUSTOMER,
      NEXT_PUBLIC_ANDREI_CUSTOMER: process.env.NEXT_PUBLIC_ANDREI_CUSTOMER,
      ANDREI_VERCEL_DEPLOY_SCOPE: process.env.ANDREI_VERCEL_DEPLOY_SCOPE,
    };
    process.env.ANDREI_CUSTOMER = "convergent";
    process.env.NEXT_PUBLIC_ANDREI_CUSTOMER = "convergent";
    delete process.env.ANDREI_VERCEL_DEPLOY_SCOPE;

    try {
      const src = await renderedChartSrc();
      if (!src) return;

      const report: typeof reports.$inferSelect = {
        id: "chart-mech-1",
        documentType: "mechanical_design_verification",
        documentNo: "825-00101",
        date: new Date("2024-10-31"),
        authorId: "user-1",
        assignedManagerId: null,
        reviewedById: null,
        deletedAt: null,
        deletedById: null,
        metadata: {
          revision: "A",
          productName: "Solea Model 3 Perioguide",
          projectName: "Solea Model 3 Perioguide",
          projectLeader: "Charles Kerbage",
          dhfIndexNo: "825-00003",
          ecoDcoNo: "DCO-02058",
          templateNo: "731-00008 Rev. B",
        },
        status: "draft",
        createdAt: new Date("2024-09-05"),
        updatedAt: new Date("2024-10-31"),
      };
      const sections: ReportSectionRecord[] = MECHANICAL_DV_SECTION_KEYS.map(
        (section, i) => {
          const base = EMPTY_MECHANICAL_DV_CONTENT[section] as Record<string, unknown>;
          const content =
            section === "observations"
              ? { ...base, narrative: chartDoc(src) }
              : { ...base };
          return {
            id: `sec-${section}-${i}`,
            reportId: report.id,
            section,
            content,
            updatedAt: "2024-10-31T00:00:00.000Z",
          };
        }
      );

      const buf = await generateReportDocx({ report, sections });
      const zip = new PizZip(buf);
      const chart = chartPngInZip(zip);
      expect(chart).not.toBeNull();
      expect(chart!.dims.width / chart!.dims.height).toBeCloseTo(
        CHART_LOGICAL_WIDTH / CHART_LOGICAL_HEIGHT,
        5
      );

      const types = zip.file("[Content_Types].xml")?.asText() ?? "";
      expect(types).toContain("image/png");
      const rels = Object.keys(zip.files).some((name) =>
        name.startsWith("word/_rels/") && (zip.file(name)?.asText() ?? "").includes(chart!.name.replace("word/", ""))
      );
      expect(rels).toBe(true);

      const xml = zip.file("word/document.xml")?.asText() ?? "";
      expect(xml).not.toContain("chartSpec");
      expect(xml).not.toContain("mock-torque");

      const extents = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)];
      expect(
        extents.some((match) => {
          const cx = Number(match[1]);
          const cy = Number(match[2]);
          return Math.abs(cx / cy - CHART_LOGICAL_WIDTH / CHART_LOGICAL_HEIGHT) < 0.05;
        })
      ).toBe(true);

      await applyGoogleDocsImageCompat(zip);
      expect(zip.file("[Content_Types].xml")?.asText()).toContain("image/png");
      expect(chartPngInZip(zip)).not.toBeNull();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("embeds a chart in an investigation narrative (ungated)", async () => {
    const src = await renderedChartSrc();
    if (!src) return;

    const reportId = "chart-ir-1";
    const sections: ReportSectionRecord[] = REPORT_SECTION_ROW_ORDER.map(
      (section, i) => ({
        id: `sec-${section}-${i}`,
        reportId,
        section,
        content:
          section === "define"
            ? { ...EMPTY_CONTENT.define, narrative: chartDoc(src) }
            : EMPTY_CONTENT[section as keyof typeof EMPTY_CONTENT],
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    );
    const report: typeof reports.$inferSelect = {
      id: reportId,
      documentType: "investigation_report",
      documentNo: "DEV/TEST/01",
      date: new Date("2026-04-08"),
      authorId: "user-1",
      assignedManagerId: null,
      reviewedById: null,
      deletedAt: null,
      deletedById: null,
      metadata: {
        toolsUsed: { sixM: true, fiveWhy: false, brainstorming: false },
        otherTools: "",
      },
      status: "draft",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    const buf = await generateReportDocx({ report, sections });
    const zip = new PizZip(buf);
    expect(chartPngInZip(zip)).not.toBeNull();
    expect(zip.file("word/document.xml")?.asText() ?? "").not.toContain("chartSpec");
  });
});
