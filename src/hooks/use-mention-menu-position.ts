"use client";

import { useLayoutEffect, useState } from "react";
import {
  computeMentionMenuPosition,
  type MentionMenuPosition,
} from "@/lib/ai/chat/mention-menu-position";

const DEFAULT_MENU_WIDTH = 256;
const DEFAULT_MENU_HEIGHT = 208;

export function useMentionMenuPosition({
  open,
  atIndex,
  textareaRef,
  anchorRef,
  boundaryRef,
  menuRef,
  deps = [],
}: {
  open: boolean;
  atIndex: number;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  anchorRef: React.RefObject<HTMLElement | null>;
  boundaryRef: React.RefObject<HTMLElement | null>;
  menuRef: React.RefObject<HTMLElement | null>;
  deps?: readonly unknown[];
}): MentionMenuPosition | null {
  const [position, setPosition] = useState<MentionMenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const update = () => {
      const textarea = textareaRef.current;
      const anchor = anchorRef.current;
      const boundary = boundaryRef.current;
      if (!textarea || !anchor || !boundary) {
        setPosition(null);
        return;
      }

      const menu = menuRef.current;
      const menuWidth = menu?.offsetWidth ?? DEFAULT_MENU_WIDTH;
      const menuHeight = menu?.offsetHeight ?? DEFAULT_MENU_HEIGHT;

      setPosition(
        computeMentionMenuPosition({
          textarea,
          atIndex,
          menuWidth,
          menuHeight,
          anchorRect: anchor.getBoundingClientRect(),
          boundaryRect: boundary.getBoundingClientRect(),
        })
      );
    };

    update();
    const raf = window.requestAnimationFrame(update);

    const textarea = textareaRef.current;
    textarea?.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      window.cancelAnimationFrame(raf);
      textarea?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, atIndex, boundaryRef, menuRef, open, textareaRef, ...deps]);

  return position;
}
