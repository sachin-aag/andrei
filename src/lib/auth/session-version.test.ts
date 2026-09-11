import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(),
  },
}));

import { db } from "@/db";
import { incrementWorkspaceUserSessionVersion } from "./session-version";

describe("incrementWorkspaceUserSessionVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bumps session_version for the workspace user", async () => {
    const where = vi.fn().mockResolvedValueOnce(undefined);
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValueOnce({ set } as never);

    await incrementWorkspaceUserSessionVersion("ws-1");

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ sessionVersion: expect.anything() })
    );
    expect(where).toHaveBeenCalled();
  });
});
