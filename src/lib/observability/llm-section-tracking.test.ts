import { beforeEach, describe, expect, it, vi } from "vitest";

const limitMock = vi.fn(async () => [] as unknown[]);
const builder = {
  from: vi.fn(() => builder),
  innerJoin: vi.fn(() => builder),
  where: vi.fn(() => builder),
  orderBy: vi.fn(() => builder),
  limit: limitMock,
};

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => builder),
  },
}));

import { checkSectionLlmAuthorship } from "./llm-section-tracking";

describe("checkSectionLlmAuthorship", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue([]);
  });

  it("returns agent_turn when a recent agent revision includes the section", async () => {
    const createdAt = new Date("2026-09-09T12:00:00.000Z");
    limitMock.mockResolvedValueOnce([{ createdAt }]);

    const result = await checkSectionLlmAuthorship("rpt-1", "define");

    expect(result).toEqual({
      wasLlmAuthored: true,
      reason: "agent_turn",
      lastModifiedAt: createdAt,
    });
    expect(builder.innerJoin).toHaveBeenCalled();
  });

  it("returns suggestion_applied when an audit event exists and no agent revision", async () => {
    const createdAt = new Date("2026-09-09T13:00:00.000Z");
    limitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ createdAt }]);

    const result = await checkSectionLlmAuthorship("rpt-1", "measure");

    expect(result).toEqual({
      wasLlmAuthored: true,
      reason: "suggestion_applied",
      lastModifiedAt: createdAt,
    });
  });

  it("returns not_llm_authored when neither source has a recent write", async () => {
    const result = await checkSectionLlmAuthorship("rpt-1", "analyze");
    expect(result).toEqual({
      wasLlmAuthored: false,
      reason: "not_llm_authored",
    });
  });
});
