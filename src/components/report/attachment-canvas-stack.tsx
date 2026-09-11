"use client";

import { AttachmentViewer } from "@/components/report/attachment-viewer";
import { CanvasTabPane } from "@/components/report/canvas-tab-pane";

export function AttachmentCanvasStack({
  openAttachmentIds,
  activeAttachmentId,
  onCloseTab,
}: {
  openAttachmentIds: readonly string[];
  activeAttachmentId: string | null;
  onCloseTab: (attachmentId: string) => void;
}) {
  if (openAttachmentIds.length === 0) return null;

  return (
    <>
      {openAttachmentIds.map((id) => {
        const active = id === activeAttachmentId;
        return (
          <CanvasTabPane
            key={id}
            active={active}
            testId="attachment-canvas"
            data-attachment-id={id}
          >
            <AttachmentViewer
              attachmentId={id}
              active={active}
              onClose={() => onCloseTab(id)}
            />
          </CanvasTabPane>
        );
      })}
    </>
  );
}
