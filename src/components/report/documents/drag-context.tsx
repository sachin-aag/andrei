"use client";

import { createContext, use, useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { collectSubtreeIds } from "@/lib/attachments/build-tree";
import {
  useReportAttachments,
  type FolderId,
} from "@/providers/report-attachments-provider";

export type DragItem = { kind: "file" | "folder"; id: string };

type DragContextValue = {
  dragging: DragItem | null;
  beginDrag: (item: DragItem) => void;
  cancelDrag: () => void;
  /** Applies the pending move onto `targetFolderId` and clears drag state. */
  endDrag: (targetFolderId: FolderId) => Promise<void>;
  canDropOn: (targetFolderId: FolderId) => boolean;
};

const DragContext = createContext<DragContextValue | null>(null);

export function DragProvider({ children }: { children: ReactNode }) {
  const { folders, moveAttachment, moveFolder, canMutateAttachments } =
    useReportAttachments();
  const [dragging, setDragging] = useState<DragItem | null>(null);

  const beginDrag = useCallback((item: DragItem) => setDragging(item), []);
  const cancelDrag = useCallback(() => setDragging(null), []);

  const canDropOn = useCallback(
    (targetFolderId: FolderId) => {
      if (!dragging || !canMutateAttachments) return false;
      if (dragging.kind === "file") return true;
      if (targetFolderId === null) return true;
      return !collectSubtreeIds(folders, dragging.id).has(targetFolderId);
    },
    [canMutateAttachments, dragging, folders]
  );

  const endDrag = useCallback(
    async (targetFolderId: FolderId) => {
      const item = dragging;
      setDragging(null);
      if (!item || !canMutateAttachments) return;
      if (item.kind === "folder" && targetFolderId !== null) {
        if (collectSubtreeIds(folders, item.id).has(targetFolderId)) return;
      }

      if (item.kind === "file") await moveAttachment(item.id, targetFolderId);
      else await moveFolder(item.id, targetFolderId);
    },
    [canMutateAttachments, dragging, folders, moveAttachment, moveFolder]
  );

  const value = useMemo<DragContextValue>(
    () => ({ dragging, beginDrag, cancelDrag, endDrag, canDropOn }),
    [dragging, beginDrag, cancelDrag, endDrag, canDropOn]
  );

  return <DragContext value={value}>{children}</DragContext>;
}

export function useDocumentDrag(): DragContextValue {
  const context = use(DragContext);
  if (!context) {
    throw new Error("useDocumentDrag must be used within DragProvider");
  }
  return context;
}
