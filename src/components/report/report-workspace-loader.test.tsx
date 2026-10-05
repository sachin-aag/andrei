// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportWorkspaceLoader } from "./report-workspace-loader";
import { WorkspaceLoadError } from "./report-workspace-bundle";

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("@/components/report/report-workspace", () => ({
  ReportWorkspace: () => null,
}));

vi.mock("@/providers/report-provider", () => ({
  ReportProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const loadSectionEditors = vi.fn((): Promise<unknown> => Promise.resolve({}));

vi.mock("./section-editor-loaders", () => ({
  loadSectionEditors: () => loadSectionEditors(),
}));

const fetchWorkspaceBundle = vi.fn();

vi.mock("./report-workspace-bundle", async () => {
  const actual = await vi.importActual<typeof import("./report-workspace-bundle")>(
    "./report-workspace-bundle"
  );
  return {
    ...actual,
    fetchWorkspaceBundle: (...args: unknown[]) => fetchWorkspaceBundle(...args),
  };
});

afterEach(() => {
  fetchWorkspaceBundle.mockReset();
  loadSectionEditors.mockReset();
  loadSectionEditors.mockImplementation(() => Promise.resolve({}));
});

const props = {
  reportId: "r1",
  documentType: "equipment_lifecycle_report" as const,
  currentUserId: "u1",
  currentUserRole: "engineer" as const,
  currentUserEmail: "eng@example.com",
  readOnly: false,
  workspaceMode: "edit" as const,
};

describe("ReportWorkspaceLoader", () => {
  it("shows a timeout instead of spinning forever", async () => {
    fetchWorkspaceBundle.mockRejectedValueOnce(
      new WorkspaceLoadError({
        status: 0,
        timedOut: true,
        message: "This report is taking too long to load. Refresh the page to try again.",
      })
    );

    render(<ReportWorkspaceLoader {...props} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "This report is taking too long to load. Refresh the page to try again."
        )
      ).toBeInTheDocument();
    });
  });
  it("retries the report request from the error screen", async () => {
    fetchWorkspaceBundle
      .mockRejectedValueOnce(
        new WorkspaceLoadError({ status: 0, message: "The report could not be loaded." })
      )
      .mockReturnValueOnce(new Promise(() => {}));

    render(<ReportWorkspaceLoader {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(fetchWorkspaceBundle).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("Loading report…")).toBeInTheDocument();
  });

  it("retries a failed editor chunk once, then says the editor did not load", async () => {
    fetchWorkspaceBundle.mockReturnValue(new Promise(() => {}));
    loadSectionEditors.mockImplementation(() =>
      Promise.reject(new Error("ChunkLoadError"))
    );

    render(<ReportWorkspaceLoader {...props} />);

    expect(
      await screen.findByText(
        "The editor could not be loaded. Check your connection and try again."
      )
    ).toBeInTheDocument();
    expect(loadSectionEditors).toHaveBeenCalledTimes(2);
  });
});
