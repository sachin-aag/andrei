import { describe, expect, it } from "vitest";
import { stripWordBookmarkAnchors } from "@/lib/import/sanitize-import-html";

describe("stripWordBookmarkAnchors", () => {
  it("removes empty Word bookmark anchor tags", () => {
    const input =
      'Intro\n<a id="_Hlk178957046"></a>\n27. <a id="_Hlk178957085"></a>Is the Corrective action assigned';
    expect(stripWordBookmarkAnchors(input)).toBe(
      "Intro\n\n27. Is the Corrective action assigned"
    );
  });
});
