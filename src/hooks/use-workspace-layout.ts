"use client";

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  allocateWorkspaceColumns,
  CHAT_DEFAULT_PX,
  chatWidthBounds,
  COLLAPSED_RAIL_PX,
  DOCS_DEFAULT_PX,
  docsWidthBounds,
  getViewportWidthServerSnapshot,
  getViewportWidthSnapshot,
  getWorkspaceLayoutServerSnapshot,
  getWorkspaceLayoutSnapshot,
  subscribeViewportWidth,
  subscribeWorkspaceLayout,
  updateWorkspaceLayout,
  writeStoredWorkspaceLayout,
  type OverflowProtect,
} from "@/components/report/workspace-layout";

type UseWorkspaceLayoutArgs = {
  chatCollapsed: boolean;
  docsCollapsed: boolean;
};

/** Collapsed app shell nav is `w-14`; used only until ResizeObserver measures. */
const APP_NAV_COLLAPSED_PX = 56;

function estimateContainerWidth(): number {
  if (typeof window === "undefined") return 1440 - APP_NAV_COLLAPSED_PX;
  return Math.max(0, window.innerWidth - APP_NAV_COLLAPSED_PX);
}

export function useWorkspaceLayout({
  chatCollapsed,
  docsCollapsed,
}: UseWorkspaceLayoutArgs) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const persistSoon = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      writeStoredWorkspaceLayout(getWorkspaceLayoutSnapshot());
    }, 200);
  }, []);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new ResizeObserver(() => {
      if (!isResizingRef.current) setProtect("none");
      setContainerWidth(node.getBoundingClientRect().width);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  const allocated = allocateWorkspaceColumns(
    containerWidth,
    viewportWidth,
    {
      chatWidth: desired.chatWidth,
      docsWidth: desired.docsWidth,
      chatCollapsed,
      docsCollapsed,
    },
    protect
  );

  const chatBounds = chatWidthBounds(viewportWidth);
  const docsBounds = docsWidthBounds(viewportWidth);

  const setChatWidth = useCallback(
    (width: number) => {
      setProtect("chat");
      updateWorkspaceLayout(
        (prev) => ({ ...prev, chatWidth: width }),
        false
      );
      persistSoon();
    },
    [persistSoon]
  );

  const setDocsWidth = useCallback(
    (width: number) => {
      setProtect("docs");
      updateWorkspaceLayout(
        (prev) => ({ ...prev, docsWidth: width }),
        false
      );
      persistSoon();
    },
    [persistSoon]
  );

  const resetChatWidth = useCallback(() => {
    setChatWidth(CHAT_DEFAULT_PX);
  }, [setChatWidth]);

  const resetDocsWidth = useCallback(() => {
    setDocsWidth(DOCS_DEFAULT_PX);
  }, [setDocsWidth]);

  const beginResize = useCallback((panel: "chat" | "docs") => {
    isResizingRef.current = true;
    setIsResizing(true);
    setProtect(panel);
  }, []);

  const endResize = useCallback(() => {
    isResizingRef.current = false;
    setIsResizing(false);
    setProtect("none");
    writeStoredWorkspaceLayout(getWorkspaceLayoutSnapshot());
  }, []);

  return {
    containerRef,
    isResizing,
    chatWidth: chatCollapsed ? COLLAPSED_RAIL_PX : allocated.chatWidth,
    docsWidth: docsCollapsed ? COLLAPSED_RAIL_PX : allocated.docsWidth,
    chatBounds,
    docsBounds,
    setChatWidth,
    setDocsWidth,
    resetChatWidth,
    resetDocsWidth,
    beginResize,
    endResize,
  };
}
