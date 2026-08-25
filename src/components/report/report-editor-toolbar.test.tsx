// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceMode } from "@/providers/report-provider";
import { ReportEditorToolbar } from "./report-editor-toolbar";

const { setTrackChangesMode, mockState } = vi.hoisted(() => ({
  setTrackChangesMode: vi.fn(),
  mockState: {
    readOnly: false,
    trackChangesMode: false,
    workspaceMode: "edit" as WorkspaceMode,
    activeFieldKey: null as string | null,
    activeFieldKind: null as "rich" | "plain" | null,
  },
}));

vi.mock("@/providers/report-provider", () => ({
  useReportData: () => ({
    readOnly: mockState.readOnly,
    trackChangesMode: mockState.trackChangesMode,
    setTrackChangesMode,
    workspaceMode: mockState.workspaceMode,
  }),
  useReportEditors: () => ({
    activeFieldKey: mockState.activeFieldKey,
    activeFieldKind: mockState.activeFieldKind,
    getActiveEditor: () => null,
  }),
}));

vi.mock("@/components/report/editor-toolbars", () => ({
  FontColorToolbar: () => null,
  InsertImageButton: () => null,
  InsertTableButton: () => null,
  ListEditToolbar: () => null,
  TextFormatToolbar: () => null,
  useEditorToolbarState: () => {},
}));

vi.mock("@/components/report/advanced-formatting-toolbar", () => ({
  AdvancedFormattingToolbar: () => null,
}));

const trackChanges = () => screen.queryByRole("checkbox", { name: /track changes/i });

describe("ReportEditorToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.readOnly = false;
    mockState.trackChangesMode = false;
    mockState.workspaceMode = "edit";
    mockState.activeFieldKey = null;
    mockState.activeFieldKind = null;
  });

  it("offers track changes before any field is focused, so the mode can be armed first", async () => {
    const user = userEvent.setup();
    render(<ReportEditorToolbar />);

    expect(screen.getByText(/select a field to start editing/i)).toBeInTheDocument();
    const toggle = trackChanges();
    expect(toggle).toBeInTheDocument();

    await user.click(toggle!);
    expect(setTrackChangesMode).toHaveBeenCalledWith(true);
  });

  it("stays reachable for a manager whose surface is otherwise read-only", () => {
    mockState.workspaceMode = "review";
    mockState.readOnly = true;
    render(<ReportEditorToolbar />);

    expect(trackChanges()).toBeInTheDocument();
  });

  it("reflects the mode as checked", () => {
    mockState.trackChangesMode = true;
    render(<ReportEditorToolbar />);

    expect(trackChanges()).toHaveAttribute("aria-checked", "true");
  });

  it("names the focused field and flags plain-text fields", () => {
    mockState.activeFieldKey = "analyze:rootCause.narrative";
    mockState.activeFieldKind = "plain";
    render(<ReportEditorToolbar />);

    expect(screen.getByText(/editing: root cause narrative/i)).toBeInTheDocument();
    expect(screen.getByText(/plain text —/i)).toBeInTheDocument();
  });

  it("renders nothing in view mode", () => {
    mockState.workspaceMode = "view";
    mockState.readOnly = true;
    const { container } = render(<ReportEditorToolbar />);

    expect(container).toBeEmptyDOMElement();
  });
});
