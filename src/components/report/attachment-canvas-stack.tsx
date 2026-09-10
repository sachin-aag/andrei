"use client";

import { AttachmentViewer } from "@/components/report/attachment-viewer";
import { cn } from "@/lib/utils";

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
          <div
            key={id}
            hidden={!active}
            inert={!active}
            data-testid="attachment-canvas"
            data-attachment-id={id}
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              !active && "hidden"
            )}
          >
            <AttachmentViewer
              attachmentId={id}
              active={active}
              onClose={() => onCloseTab(id)}
            />
          </div>
        );
      })}
    </>
  );
}
