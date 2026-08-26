"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { pageCountForContentHeight } from "@/lib/document-types/generic/page-layout";

export function PagedDocumentSurface({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const metricRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [pageHeightPx, setPageHeightPx] = useState(0);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const metric = metricRef.current;
    if (!root || !metric) return;

    let observedEditor: Element | null = null;
    const measure = () => {
      const pageH = metric.getBoundingClientRect().height;
      if (!(pageH > 0)) return;
      setPageHeightPx(pageH);
      const editor = root.querySelector<HTMLElement>(".ProseMirror");
      const contentH = editor?.scrollHeight ?? pageH;
      setPageCount(pageCountForContentHeight(contentH, pageH));
    };

    const observer = new ResizeObserver(measure);
    observer.observe(metric);

    const attachEditor = () => {
      const editor = root.querySelector(".ProseMirror");
      if (editor && editor !== observedEditor) {
        if (observedEditor) observer.unobserve(observedEditor);
        observedEditor = editor;
        observer.observe(editor);
        measure();
      }
    };
    attachEditor();
    const mutations = new MutationObserver(attachEditor);
    mutations.observe(root, { childList: true, subtree: true });
    measure();

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="generic-paged-document relative mx-auto"
      data-testid="paged-document"
      data-page-count={pageCount}
    >
      <div
        ref={metricRef}
        aria-hidden="true"
        className="generic-page-metric pointer-events-none absolute top-0 left-0"
      />
      <div className="generic-page-sheet relative z-[1]">{children}</div>
      {pageHeightPx > 0
        ? Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => (
            <div
              key={`sep-${index}`}
              role="separator"
              aria-label={`Page ${index + 1} of ${pageCount}`}
              className="generic-page-separator pointer-events-none absolute z-[2] flex items-center justify-center"
              style={{ top: pageHeightPx * (index + 1) }}
            >
              <span className="generic-page-separator-label">
                Page {index + 1}
              </span>
            </div>
          ))
        : null}
      {pageHeightPx > 0
        ? Array.from({ length: pageCount }, (_, index) => (
            <div
              key={`num-${index}`}
              className="generic-page-number pointer-events-none absolute z-[2] tabular-nums"
              style={{ top: pageHeightPx * (index + 1) - 28 }}
            >
              {index + 1}
            </div>
          ))
        : null}
    </div>
  );
}
