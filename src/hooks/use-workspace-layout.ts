"use client";

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { WorkspaceChrome } from "@/components/report/workspace-chrome";
import {
  allocateWorkspaceColumns,
  bindWorkspaceLayoutToReport,
  CHAT_DEFAULT_PX,
  chatWidthBounds,
  clamp,
  COLLAPSED_RAIL_PX,
  DOCS_DEFAULT_PX,
  docsWidthBounds,
  DOCUMENT_WIDTH_DEFAULT_PX,
  DOCUMENT_WIDTH_MAX_PX,
  DOCUMENT_WIDTH_MIN_PX,
  documentWidthBounds,
  getViewportWidthServerSnapshot,
  getViewportWidthSnapshot,
  getWorkspaceLayoutServerSnapshot,
  getWorkspaceLayoutSnapshot,
  PREVIEW_DEFAULT_PX,
  previewWidthBounds,
  subscribeViewportWidth,
  subscribeWorkspaceLayout,
  updateWorkspaceLayout,
  type OverflowProtect,
} from "@/components/report/workspace-layout";

type UseWorkspaceLayoutArgs = {
  reportId: string;
  chrome: WorkspaceChrome;
  chatCollapsed: boolean;
  docsCollapsed: boolean;
  previewCollapsed?: boolean;
};

/** Collapsed app shell nav is `w-14`; used only until ResizeObserver measures. */
const APP_NAV_COLLAPSED_PX = 56;

function estimateContainerWidth(): number {
  if (typeof window === "undefined") return 1440 - APP_NAV_COLLAPSED_PX;
  return Math.max(0, window.innerWidth - APP_NAV_COLLAPSED_PX);
}

export function useWorkspaceLayout({
  reportId,
  chrome,
  chatCollapsed,
  docsCollapsed,
  previewCollapsed = false,
}: UseWorkspaceLayoutArgs) {
  bindWorkspaceLayoutToReport(reportId);

  const containerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  const viewportWidth = useSyncExternalStore(
    subscribeViewportWidth,
    getViewportWidthSnapshot,
    getViewportWidthServerSnapshot
  );
  const desired = useSyncExternalStore(
    subscribeWorkspaceLayout,
    getWorkspaceLayoutSnapshot,
    getWorkspaceLayoutServerSnapshot
  );

  const [containerWidth, setContainerWidth] = useState(estimateContainerWidth);
  const [protect, setProtect] = useState<OverflowProtect>("none");
  const [isResizing, setIsResizing] = useState(false);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new ResizeObserver(() => {
      if (!isResizingRef.current) setProtect("none");
      setContainerWidth(node.getBoundingClientRect().width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const allocated = allocateWorkspaceColumns(
    containerWidth,
    viewportWidth,
    {
      chrome,
      chatWidth: desired.chatWidth,
      docsWidth: desired.docsWidth,
      previewWidth: desired.previewWidth,
      chatCollapsed,
      docsCollapsed,
      previewCollapsed,
    },
    protect
  );

  const chatBounds = chatWidthBounds(viewportWidth);
  const docsBounds = docsWidthBounds(viewportWidth);
  const previewBounds = previewWidthBounds(viewportWidth);
  const documentBounds = documentWidthBounds();
  const documentWidth = clamp(
    desired.documentWidth,
    documentBounds.min,
    documentBounds.max
  );

  const setChatWidth = useCallback((width: number) => {
    setProtect("chat");
    updateWorkspaceLayout((prev) => ({ ...prev, chatWidth: width }));
  }, []);

  const setDocsWidth = useCallback((width: number) => {
    setProtect("docs");
    updateWorkspaceLayout((prev) => ({ ...prev, docsWidth: width }));
  }, []);

  const setPreviewWidth = useCallback((width: number) => {
    setProtect("preview");
    updateWorkspaceLayout((prev) => ({ ...prev, previewWidth: width }));
  }, []);

  const resetChatWidth = useCallback(() => {
    setChatWidth(CHAT_DEFAULT_PX);
  }, [setChatWidth]);

  const resetDocsWidth = useCallback(() => {
    setDocsWidth(DOCS_DEFAULT_PX);
  }, [setDocsWidth]);

  const resetPreviewWidth = useCallback(() => {
    setPreviewWidth(PREVIEW_DEFAULT_PX);
  }, [setPreviewWidth]);

  const setDocumentWidth = useCallback((width: number) => {
    updateWorkspaceLayout((prev) => ({
      ...prev,
      documentWidth: clamp(
        Math.round(width),
        DOCUMENT_WIDTH_MIN_PX,
        DOCUMENT_WIDTH_MAX_PX
      ),
    }));
  }, []);

  const resetDocumentWidth = useCallback(() => {
    setDocumentWidth(DOCUMENT_WIDTH_DEFAULT_PX);
  }, [setDocumentWidth]);

  const beginResize = useCallback(
    (panel: "chat" | "docs" | "preview" | "document") => {
      isResizingRef.current = true;
      setIsResizing(true);
      if (panel !== "document") setProtect(panel);
    },
    []
  );

  const endResize = useCallback(() => {
    isResizingRef.current = false;
    setIsResizing(false);
    setProtect("none");
  }, []);

  return {
    containerRef,
    isResizing,
    chatWidth: chatCollapsed ? COLLAPSED_RAIL_PX : allocated.chatWidth,
    docsWidth: docsCollapsed ? COLLAPSED_RAIL_PX : allocated.docsWidth,
    previewWidth: allocated.previewWidth,
    documentWidth,
    chatBounds,
    docsBounds,
    previewBounds,
    documentBounds,
    setChatWidth,
    setDocsWidth,
    setPreviewWidth,
    setDocumentWidth,
    resetChatWidth,
    resetDocsWidth,
    resetPreviewWidth,
    resetDocumentWidth,
    beginResize,
    endResize,
  };
}
