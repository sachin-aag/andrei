import { describe, expect, it } from "vitest";
import { createDocxExportContext } from "@/lib/export/docx-export-context";
import { improveControlCheckpointsToDocxXml } from "@/lib/export/improve-control-checkpoints-docx";
import {
  CONTROL_SECTION_HEADER,
  CONTROL_SECTION_INTRO,
  IMPROVE_SECTION_HEADER,
  IMPROVE_SECTION_INTRO,
} from "@/lib/report-section-guidance";

function boldRunFor(text: string, xml: string): boolean {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<w:r><w:rPr>[\\s\\S]*?<w:b\\/>[\\s\\S]*?<\\/w:rPr><w:t[^>]*>\\s*${escaped}`,
    "i"
  );
  return re.test(xml);
}

describe("improveControlCheckpointsToDocxXml", () => {
  it("bolds improve section header and intro lines", () => {
    const ctx = createDocxExportContext();
    const xml = improveControlCheckpointsToDocxXml(
      [IMPROVE_SECTION_HEADER, IMPROVE_SECTION_INTRO, "1. Example checkpoint?"].join(
        "\n"
      ),
      "improve",
      ctx
    );

    expect(boldRunFor("Improve: Improve section covers the corrective actions", xml)).toBe(
      true
    );
    expect(
      boldRunFor(
        "Following checkpoint shall be considered as guidance only while finalizing the corrective actions,",
        xml
      )
    ).toBe(true);
  });

  it("bolds control section header and intro lines", () => {
    const ctx = createDocxExportContext();
    const xml = improveControlCheckpointsToDocxXml(
      [CONTROL_SECTION_HEADER, CONTROL_SECTION_INTRO, "1. Example checkpoint?"].join(
        "\n"
      ),
      "control",
      ctx
    );

    expect(boldRunFor("Control: Control section covers the preventive actions", xml)).toBe(
      true
    );
    expect(
      boldRunFor("Following checkpoint shall be considered as guidance only ,", xml)
    ).toBe(true);
  });

  it("bolds key phrases inside checklist lines", () => {
    const ctx = createDocxExportContext();
    const xml = improveControlCheckpointsToDocxXml(
      "1. Is a specific corrective Actions identified to return the system to a state of control/compliance?",
      "improve",
      ctx
    );

    expect(boldRunFor("specific corrective Actions", xml)).toBe(true);
    expect(boldRunFor("state of control/compliance", xml)).toBe(true);
  });
});
