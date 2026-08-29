import { describe, expect, it } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { asPreviewImage } from "./preview-image";

describe("asPreviewImage", () => {
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
