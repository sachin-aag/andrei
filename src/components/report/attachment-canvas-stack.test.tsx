// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttachmentCanvasStack } from "@/components/report/attachment-canvas-stack";

vi.mock("@/components/report/attachment-viewer", () => ({
  AttachmentViewer: ({
    attachmentId,
    active,
  }: {
    attachmentId: string;
    active: boolean;
  }) => (
    <div data-testid={`viewer-${attachmentId}`} data-active={String(active)}>
      {attachmentId}
    </div>
  ),
}));

describe("AttachmentCanvasStack", () => {
  it("keeps every open attachment mounted when switching away", () => {
    const onCloseTab = vi.fn();
    const { rerender } = render(
      <AttachmentCanvasStack
        openAttachmentIds={["att-1"]}
        activeAttachmentId="att-1"
        onCloseTab={onCloseTab}
      />
    );

    const canvas = screen.getByTestId("attachment-canvas");
    expect(canvas).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("viewer-att-1")).toHaveAttribute(
      "data-active",
      "true"
    );

    rerender(
      <AttachmentCanvasStack
        openAttachmentIds={["att-1"]}
        activeAttachmentId={null}
        onCloseTab={onCloseTab}
      />
    );

    expect(screen.getByTestId("attachment-canvas")).toHaveAttribute("hidden");
    expect(screen.getByTestId("viewer-att-1")).toHaveAttribute(
      "data-active",
      "false"
    );
  });

  it("unmounts a canvas when its tab is no longer open", () => {
    const { rerender } = render(
      <AttachmentCanvasStack
        openAttachmentIds={["att-1", "att-2"]}
        activeAttachmentId="att-2"
        onCloseTab={vi.fn()}
      />
    );

    expect(screen.getByTestId("viewer-att-1")).toBeInTheDocument();
    expect(screen.getByTestId("viewer-att-2")).toBeInTheDocument();

    rerender(
      <AttachmentCanvasStack
        openAttachmentIds={["att-2"]}
        activeAttachmentId="att-2"
        onCloseTab={vi.fn()}
      />
    );

    expect(screen.queryByTestId("viewer-att-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("viewer-att-2")).toBeInTheDocument();
  });
});
