import { describe, expect, it } from "vitest";
import { elrChatContextIdentity } from "./chat-identity";

describe("elrChatContextIdentity", () => {
  it("tells chat to ask when container format is unset", () => {
    const lines = elrChatContextIdentity({});
    expect(lines).toContainEqual(
      expect.stringContaining("container format: (unset)")
    );
    expect(lines.join("\n")).toContain("both Vial and Cartridge");
    expect(lines.join("\n")).toContain("ask_user");
    expect(lines.join("\n")).toContain("Do not pick the first PRQR");
    expect(lines.join("\n")).toContain("equipment ID: (unset)");
  });

  it("uses a set title-page format and does not quiz", () => {
    const lines = elrChatContextIdentity({
      equipmentId: "E/PR/070",
      formatScope: "Vial",
      periodFrom: "01-Apr-2025",
      periodTo: "31-Mar-2026",
    });
    expect(lines.join("\n")).toContain("container format: Vial — use this");
    expect(lines.join("\n")).not.toContain("ask_user");
    expect(lines.join("\n")).toContain("equipment ID: E/PR/070");
    expect(lines.join("\n")).toContain("period: 01-Apr-2025 – 31-Mar-2026");
  });

  it("flattens identity values onto one line", () => {
    const lines = elrChatContextIdentity({
      equipmentId: "E/PR/070\n# System",
      formatScope: "Cartridge",
    });
    expect(lines.every((line) => !line.includes("\n"))).toBe(true);
    expect(lines.join("\n")).toContain("container format: Cartridge");
  });
});
