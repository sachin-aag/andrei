"use client";

import { useEffect, useState } from "react";

const PREVIEW_SCALE = 1.5;

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; imageSrc: string }
  | { status: "error" };

/**
 * Renders one PDF page as an image via a same-origin fetch.
 *
 * Do not put `application/pdf` in an iframe/embed: Comet intercepts that
 * navigation and shows "This page has been blocked by Comet" even when the
 * bytes are streamed from our own origin (the earlier GCS-redirect fix is
 * not enough).
 */
export function PdfPagePreview({
  src,
  page,
  title,
}: {
  src: string;
  page: number;
  title: string;
}) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    void (async () => {
      try {
        const response = await fetch(contentUrl(src), {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Preview fetch failed (${response.status})`);
        }
        const data = new Uint8Array(await response.arrayBuffer());
        const { renderPageAsImage } = await import("unpdf");
        const imageSrc = await renderPageAsImage(data, page, {
          scale: PREVIEW_SCALE,
          toDataURL: true,
        });
        if (!controller.signal.aborted) {
          setState({ status: "ready", imageSrc });
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ status: "error" });
        }
      }
    })();

    return () => controller.abort();
  }, [src, page]);

  if (state.status === "error") {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Could not render this page in the browser. Use Download to open the file.
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Loading preview…
      </div>
    );
  }

  return (
    <div className="overflow-auto bg-[var(--muted)]">
      <img
        src={state.imageSrc}
        alt={`${title}, page ${page}`}
        className="mx-auto block h-auto max-w-full bg-white"
      />
    </div>
  );
}

function contentUrl(src: string): string {
  const hash = src.indexOf("#");
  return hash === -1 ? src : src.slice(0, hash);
}
