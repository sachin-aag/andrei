import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import {
  ANALYTICS_CHAT_SURFACE,
  isChatSurface,
  REPORT_CHAT_SURFACE,
} from "./sessions";

describe("chat surfaces", () => {
  it("treats report and analytics as the only session surfaces", () => {
    expect(isChatSurface("report")).toBe(true);
    expect(isChatSurface("analytics")).toBe(true);
    expect(isChatSurface("improve-ai")).toBe(false);
    expect(REPORT_CHAT_SURFACE).toBe("report");
    expect(ANALYTICS_CHAT_SURFACE).toBe("analytics");
  });
});
