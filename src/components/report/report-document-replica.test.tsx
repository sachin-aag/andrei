// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ReportDocumentReplica } from "./report-document-replica";

vi.mock("@/providers/report-provider", () => ({
  ReportViewOnlyOverride: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("./report-header", () => ({
  ReportHeader: () => <div data-testid="replica-header">Identity</div>,
}));

vi.mock("./lazy-workspace-section", () => ({
  LazyWorkspaceSection: ({
    id,
    children,
  }: {
    id: string;
    children: ReactNode;
  }) => <section data-testid={id}>{children}</section>,
}));

vi.mock("./report-workspace-loading", () => ({
  ReportWorkspaceLoading: () => <div>Loading sections</div>,
}));

vi.mock("./canvas-tab-pane", () => ({
  CanvasTabPane: ({
    children,
    header,
    testId,
  }: {
    children: ReactNode;
    header?: ReactNode;
    testId?: string;
  }) => (
    <div data-testid={testId}>
      {header}
      {children}
    </div>
  ),
}));

describe("ReportDocumentReplica", () => {
  it("renders the real document chrome as view-only, not a markdown dump", () => {
    render(
      <ReportDocumentReplica
        paneId="pane-1"
        active
        editorsAllowed
        workspaceSectionList={[{ key: "define", label: "Define" }]}
        sectionEditors={{
          define: () => <p>Problem statement table</p>,
        }}
        documentType="investigation_report"
        continuousDocument={false}
        documentWidth={880}
      />
    );

    expect(screen.getByTestId("report-view-only-banner")).toHaveTextContent(
      "View only. Edits stay in the top-left report."
    );
    expect(screen.getByTestId("replica-header")).toBeInTheDocument();
    expect(screen.getByTestId("pane-1-define")).toHaveTextContent(
      "Problem statement table"
    );
    expect(screen.queryByText(/markdown/i)).toBeNull();
  });
});
