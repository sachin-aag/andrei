/**
 * Per-attachment PDF preview page: jump target vs last-scrolled page.
 *
 * `previewPageById` is the `page` prop (citation / first open / restore after
 * close). Scrolling must not write this map — that would `scrollIntoView` on
 * every page while the engineer reads. Last-scrolled page lives separately
 * and is used only when opening a file that is not already in the map.
 */

export function resolveDocumentPreviewOpen(args: {
  previewPageById: Readonly<Record<string, number>>;
  lastViewedPage: number | undefined;
  attachmentId: string;
  requestedPage: number | undefined;
}): {
  page: number;
  previewPageById: Record<string, number>;
  skipJump: boolean;
} {
  const { previewPageById, lastViewedPage, attachmentId, requestedPage } =
    args;

  if (requestedPage !== undefined) {
    const page = Math.max(1, requestedPage);
    return {
      page,
      skipJump: false,
      previewPageById:
        previewPageById[attachmentId] === page
          ? (previewPageById as Record<string, number>)
          : { ...previewPageById, [attachmentId]: page },
    };
  }

  const existing = previewPageById[attachmentId];
  if (existing !== undefined) {
    return {
      page: existing,
      skipJump: true,
      previewPageById,
    };
  }

  const page = Math.max(1, lastViewedPage ?? 1);
  return {
    page,
    skipJump: false,
    previewPageById: { ...previewPageById, [attachmentId]: page },
  };
}

export function omitDocumentPreviewPage(
  previewPageById: Readonly<Record<string, number>>,
  attachmentId: string
): Record<string, number> {
  if (!(attachmentId in previewPageById)) {
    return previewPageById as Record<string, number>;
  }
  const next = { ...previewPageById };
  delete next[attachmentId];
  return next;
}
