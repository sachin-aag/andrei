/**
 * Presentation model for the large-file upload tape.
 *
 * Small attachments land in a second or two, so the thin bar in the document
 * tree is enough for them. Anything past the threshold below is a multi-minute
 * wait — the bytes travel in 8–32 MB GCS chunks, then Vertex reads the document
 * a page at a time — and that wait needs to be legible.
 *
 * The tape is one band of discrete cells that changes what it measures:
 * while uploading, one cell is one 8 MB grain (the adaptive-upload floor);
 * while reading, one cell is one page. Nothing here interpolates — a cell inks
 * in only when that grain or page has actually landed. A 16–32 MB PUT fills
 * more than one cell at once.
 *
 * Pure functions only, so the phase/copy rules stay unit-testable.
 */

import type { AttachmentProcessingStatus } from "@/db/schema";
import { MIN_CHUNK_SIZE_BYTES } from "./upload-client";

/** Above this size the row shows the tape instead of the thin progress bar. */
export const LARGE_UPLOAD_THRESHOLD_BYTES = 50 * 1024 * 1024;

/** No byte advance for this long during transfer reads as a slow connection. */
export const UPLOAD_STALL_AFTER_MS = 12_000;

/**
 * Layout bounds. 32 cells keeps chunks 1:1 up to 256 MB, which covers the
 * current per-file cap. Past that the tape scales rather than losing cells.
 */
const MAX_CHUNK_CELLS = 32;
const MIN_READING_CELLS = 6;
const MAX_READING_CELLS = 36;
/** Cell count when the page total is not known yet. */
const UNKNOWN_PAGE_CELLS = 24;

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

export function isLargeUpload(sizeBytes: number): boolean {
  return Number.isFinite(sizeBytes) && sizeBytes > LARGE_UPLOAD_THRESHOLD_BYTES;
}

export type UploadTapePhase =
  | "uploading"
  | "stalled"
  | "checking"
  | "queued"
  | "reading"
  | "indexing";

/**
 * `processingProgress` from run-document-ingest is a whole-pipeline percentage,
 * not a page percentage: page extraction is mapped onto 10–70, pages are
 * assembled at 80, and chunking plus embedding carry it to 100.
 *
 * So it must never be shown next to a page number — at page 270 of 300 the
 * pipeline reads about 64%, and the two figures contradict each other. Reading
 * is driven by pages; everything past extraction is its own phase.
 */
const EXTRACT_PROGRESS_START = 10;
const EXTRACT_PROGRESS_END = 70;
const INDEXING_PROGRESS_START = 80;

/** Live transfer state, present only in the tab that is doing the upload. */
export type UploadTransferState = {
  uploadedBytes: number;
  /** Smoothed rate over recent chunks; null until two samples have landed. */
  bytesPerSecond: number | null;
  /** Epoch ms of the most recent byte advance. */
  lastAdvanceAt: number;
};

export type UploadTapeInput = {
  status: AttachmentProcessingStatus;
  sizeBytes: number;
  transfer: UploadTransferState | null;
  processingProgress: number;
  processingPage: number | null;
  pageCount: number | null;
  /** Epoch ms. Zero means the client clock has not started — stay static. */
  nowMs: number;
};

export type UploadTapeView = {
  phase: UploadTapePhase;
  /** Sentence-case line naming what is happening right now. */
  line: string;
  /** Right-aligned figure set in tabular numerals. Empty renders nothing. */
  figure: string;
  cellCount: number;
  /** Cells that have actually landed. */
  filledCells: number;
  /** Cell the reading head sits on, or null when the tape is idle or full. */
  headCell: number | null;
  /** 0–100, for the progressbar role. */
  percent: number;
  /** Full sentence for screen readers and the row tooltip. */
  ariaLabel: string;
};

/**
 * Builds the tape for one attachment, or null when the file is not mid-flight.
 */
export function describeUploadTape(input: UploadTapeInput): UploadTapeView | null {
  switch (input.status) {
    case "uploading":
      return describeSending(input);
    case "validating":
      return describeHeld(input, "checking", "Checking the file");
    case "queued":
      return describeHeld(input, "queued", "Waiting to start processing");
    case "processing":
      return describeReading(input);
    default:
      return null;
  }
}

function describeSending(input: UploadTapeInput): UploadTapeView {
  const total = Math.max(0, input.sizeBytes);
  const cellCount = chunkCellCount(total);

  // Without live transfer state (a reload mid-upload, or a second tab) the
  // server's coarse percentage is all we have. Never invent a rate from it.
  const uploaded = input.transfer
    ? clamp(input.transfer.uploadedBytes, 0, total)
    : Math.round((clampPercent(input.processingProgress) / 100) * total);

  // Scale landed chunks onto the cells. Below the layout cap the two counts are
  // equal, so this is exactly "one cell per acknowledged chunk"; past it the
  // tape stays proportional instead of reading full while bytes are still going.
  const totalChunks = total > 0 ? Math.ceil(total / MIN_CHUNK_SIZE_BYTES) : 1;
  const landedChunks = Math.floor(uploaded / MIN_CHUNK_SIZE_BYTES);
  const complete = total > 0 && uploaded >= total;
  const filledCells = complete
    ? cellCount
    : clamp(Math.floor((landedChunks / totalChunks) * cellCount), 0, cellCount);
  const percent = total > 0 ? clampPercent((uploaded / total) * 100) : 0;

  const idleMs =
    input.transfer && input.nowMs > 0 && input.transfer.lastAdvanceAt > 0
      ? input.nowMs - input.transfer.lastAdvanceAt
      : 0;
  const stalled = !complete && idleMs >= UPLOAD_STALL_AFTER_MS;

  // Both halves stay short — the panel is ~270px wide and the figure sits on
  // the same line, so a longer phrase truncates instead of reassuring anyone.
  const line = stalled ? "Slow connection" : `Uploading ${formatFileSize(total)}`;
  const figure = stalled
    ? `${formatFileSize(uploaded)} uploaded`
    : sendingFigure({ uploaded, total, percent, transfer: input.transfer, idleMs });

  return {
    phase: stalled ? "stalled" : "uploading",
    line,
    figure,
    cellCount,
    filledCells,
    headCell: filledCells < cellCount ? filledCells : null,
    percent,
    ariaLabel: sendingAriaLabel({ uploaded, total, percent, stalled, transfer: input.transfer }),
  };
}

function sendingFigure({
  uploaded,
  total,
  percent,
  transfer,
  idleMs,
}: {
  uploaded: number;
  total: number;
  percent: number;
  transfer: UploadTransferState | null;
  idleMs: number;
}): string {
  const rate = transfer?.bytesPerSecond ?? null;
  if (rate === null || rate <= 0 || total <= 0) return `${Math.round(percent)}%`;

  // Decay the estimate between chunk arrivals so the countdown stays alive
  // rather than freezing on the last sample for eight seconds at a time.
  const remaining = Math.max(0, total - uploaded);
  const seconds = remaining / rate - Math.max(0, idleMs) / 1000;

  if (seconds <= 0.5) {
    // Only claim the finish line when the bytes agree; otherwise stay factual.
    return percent >= 90 ? "Almost done" : `${Math.round(percent)}%`;
  }
  return formatTimeRemaining(seconds);
}

function sendingAriaLabel({
  uploaded,
  total,
  percent,
  stalled,
  transfer,
}: {
  uploaded: number;
  total: number;
  percent: number;
  stalled: boolean;
  transfer: UploadTransferState | null;
}): string {
  const counts = `${formatFileSize(uploaded)} of ${formatFileSize(total)} uploaded (${Math.round(percent)}%)`;
  const rate = transfer?.bytesPerSecond ?? null;
  const speed = rate !== null && rate > 0 ? ` at ${formatTransferRate(rate)}` : "";
  return stalled
    ? `Still uploading — ${counts}${speed}`
    : `Uploading — ${counts}${speed}`;
}

/**
 * Server-side holding states. The tape keeps its chunk grain and stays fully
 * inked so the transfer visibly holds rather than restarting.
 */
function describeHeld(
  input: UploadTapeInput,
  phase: "checking" | "queued",
  line: string
): UploadTapeView {
  const cellCount = chunkCellCount(Math.max(0, input.sizeBytes));
  return {
    phase,
    line,
    figure: "",
    cellCount,
    filledCells: cellCount,
    headCell: null,
    percent: 100,
    ariaLabel: `${line}. The whole file has been received.`,
  };
}

function describeReading(input: UploadTapeInput): UploadTapeView {
  const pageCount =
    input.pageCount !== null && input.pageCount > 0 ? input.pageCount : null;
  const cellCount = readingCellCount(pageCount);

  // Every page has been read; what is left is chunking and embedding, which has
  // no page to point at. `processingPage` still holds the last page it saw, so
  // without this the row would sit on "Processing page 300 of 300" for the last
  // stretch of the run.
  if (input.processingProgress >= INDEXING_PROGRESS_START) {
    return {
      phase: "indexing",
      line: "Making it searchable",
      figure: "",
      cellCount,
      filledCells: cellCount,
      headCell: null,
      percent: clampPercent(input.processingProgress),
      ariaLabel:
        pageCount !== null
          ? `All ${pageCount} pages processed. Making the document searchable.`
          : "All pages processed. Making the document searchable.",
    };
  }

  const percent = readingPercent(input, pageCount);
  const filledCells = clamp(Math.round((percent / 100) * cellCount), 0, cellCount);

  const page = input.processingPage;
  const line =
    page !== null && page > 0
      ? pageCount !== null
        ? `Processing page ${page} of ${pageCount}`
        : `Processing page ${page}`
      : "Processing the document";

  return {
    phase: "reading",
    line,
    figure: `${Math.round(percent)}%`,
    cellCount,
    filledCells,
    headCell: filledCells < cellCount ? filledCells : null,
    percent,
    ariaLabel: `${line} — ${Math.round(percent)}% processed.`,
  };
}

/**
 * Pages first — it is the only figure that can sit beside "page 270 of 300"
 * without contradicting it. The pipeline percentage is a fallback for the gap
 * before the first page number lands, rescaled from its 10–70 extraction band.
 */
function readingPercent(input: UploadTapeInput, pageCount: number | null): number {
  if (pageCount !== null && input.processingPage !== null && input.processingPage > 0) {
    return clampPercent((input.processingPage / pageCount) * 100);
  }
  const reported = clampPercent(input.processingProgress);
  if (reported <= EXTRACT_PROGRESS_START) return 0;
  const span = EXTRACT_PROGRESS_END - EXTRACT_PROGRESS_START;
  return clampPercent(((reported - EXTRACT_PROGRESS_START) / span) * 100);
}

/**
 * One cell per 8 MB of acknowledged bytes — a 96 MB file is exactly 12 cells.
 * Adaptive PUTs of 16–32 MB fill two or four cells when that PUT lands.
 */
export function chunkCellCount(sizeBytes: number): number {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 1;
  return clamp(Math.ceil(sizeBytes / MIN_CHUNK_SIZE_BYTES), 1, MAX_CHUNK_CELLS);
}

/**
 * One cell per page. Reading is finer-grained work than transferring, so the
 * tape subdivides when the phase turns over.
 */
export function readingCellCount(pageCount: number | null): number {
  if (pageCount === null || pageCount <= 0) return UNKNOWN_PAGE_CELLS;
  return clamp(pageCount, MIN_READING_CELLS, MAX_READING_CELLS);
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / KB))} KB`;
}

export function formatTransferRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 MB/s";
  if (bytesPerSecond >= MB) return `${(bytesPerSecond / MB).toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bytesPerSecond / KB))} KB/s`;
}

export function formatTimeRemaining(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${Math.max(1, rounded)}s left`;
  if (rounded < 3600) {
    const minutes = Math.floor(rounded / 60);
    return `${minutes}:${String(rounded % 60).padStart(2, "0")} left`;
  }
  return "over an hour left";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampPercent(value: number): number {
  return clamp(value, 0, 100);
}
