import { describe, expect, it } from "vitest";
import {
  normalizeWorkspaceBundle,
  workspaceLoadErrorMessage,
} from "./report-workspace-bundle";
import type { ReportBundle } from "@/types/report";

describe("workspaceLoadErrorMessage", () => {
  it("explains missing and forbidden reports", () => {
    expect(workspaceLoadErrorMessage(401)).toBe(
      "Your session has expired. Sign in again to open this report."
    );
    expect(workspaceLoadErrorMessage(404)).toBe("This report was not found.");
    expect(workspaceLoadErrorMessage(403)).toBe(
      "You do not have access to this report."
    );
    expect(workspaceLoadErrorMessage(500)).toBe(
      "The report could not be loaded."
    );
  });
});

describe("normalizeWorkspaceBundle", () => {
  it("fills attachments when GET omits them", () => {
    const data = {
      report: { id: "r1" },
      sections: [],
      evaluations: [],
      comments: [],
    } as unknown as ReportBundle;
    expect(normalizeWorkspaceBundle(data)).toEqual({
      ...data,
      attachments: [],
      attachmentFolders: [],
    });
  });
});
