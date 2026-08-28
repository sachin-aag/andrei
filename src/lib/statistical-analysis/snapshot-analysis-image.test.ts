import { describe, expect, it } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { asPreviewImage } from "./snapshot-analysis-image";
import { snapshotAnalysisPreviewImage } from "./snapshot-analysis-image";

describe("snapshotAnalysisPreviewImage", () => {
  it("returns null for non-graph kinds", async () => {
    const preview = await snapshotAnalysisPreviewImage({
      kind: "one_way_anova",
      title: "ANOVA",
      config: {
        responseColumnId: "r",
        responseColumnName: "Response",
        factorColumnId: "f",
        factorColumnName: "Factor",
        title: "ANOVA",
      },
      results: {} as never,
    });
    expect(preview).toBeNull();
  });

  it("parses stored preview payloads", () => {
    const preview = {
      dataUrl: "data:image/png;base64,AAAA",
      widthPx: 600,
      heightPx: 400,
      alt: "Torque",
      chartSpec: TORQUE_MOCK_SPEC,
    };
    expect(asPreviewImage(preview)?.alt).toBe("Torque");
    expect(asPreviewImage({ ...preview, dataUrl: "http://evil" })).toBeNull();
  });
});
