export const DRAWING_OVERLAY_VERSION = 1 as const;
/** Ink on the figure — matches 3xper Word callout red, not UI chrome. */
export const DRAWING_DEFAULT_COLOR = "#c62828";

export type DrawingArrow = {
  id: string;
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
};

export type DrawingLabel = {
  id: string;
  type: "label";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
};

export type DrawingShape = DrawingArrow | DrawingLabel;

export type ImageDrawing = {
  version: typeof DRAWING_OVERLAY_VERSION;
  shapes: DrawingShape[];
};

export type DrawingCallout = {
  text: string;
  /** Optional arrow tip on the photo, 0–1. */
  tipX?: number;
  tipY?: number;
};

/**
 * Bounding box in photo units. The picture itself is always 0–1 × 0–1;
 * arrows and labels may sit outside that square.
 */
export type DrawingExtent = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** Extra drawable margin around the photo in the Annotate dialog (photo units). */
export const EDITOR_DRAWING_PAD = 0.28;

const COORD_MIN = -2;
const COORD_MAX = 3;
const STROKE_PAD = 0.02;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Allow callouts in the margin; reject wild values. */
function clampCoord(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(COORD_MAX, Math.max(COORD_MIN, value));
}

function clampDim(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(2, value);
}

export function extentWidth(extent: DrawingExtent): number {
  return Math.max(1e-6, extent.maxX - extent.minX);
}

export function extentHeight(extent: DrawingExtent): number {
  return Math.max(1e-6, extent.maxY - extent.minY);
}

export function drawingHasOverflow(
  drawing: ImageDrawing | null | undefined
): boolean {
  if (!drawing) return false;
  for (const shape of drawing.shapes) {
    if (shape.type === "arrow") {
      if (
        shape.x1 < 0 ||
        shape.y1 < 0 ||
        shape.x1 > 1 ||
        shape.y1 > 1 ||
        shape.x2 < 0 ||
        shape.y2 < 0 ||
        shape.x2 > 1 ||
        shape.y2 > 1
      ) {
        return true;
      }
      continue;
    }
    if (shape.x < 0 || shape.y < 0 || shape.x + shape.w > 1 || shape.y + shape.h > 1) {
      return true;
    }
  }
  return false;
}

/**
 * Tight box around the photo plus any overflow shapes. Used by the document
 * figure and Word flatten so outside labels stay visible.
 */
export function drawingExtent(
  drawing: ImageDrawing | null | undefined,
  extraPad = 0
): DrawingExtent {
  let minX = 0;
  let minY = 0;
  let maxX = 1;
  let maxY = 1;
  for (const shape of drawing?.shapes ?? []) {
    if (shape.type === "arrow") {
      minX = Math.min(minX, shape.x1, shape.x2);
      minY = Math.min(minY, shape.y1, shape.y2);
      maxX = Math.max(maxX, shape.x1, shape.x2);
      maxY = Math.max(maxY, shape.y1, shape.y2);
    } else {
      minX = Math.min(minX, shape.x);
      minY = Math.min(minY, shape.y);
      maxX = Math.max(maxX, shape.x + shape.w);
      maxY = Math.max(maxY, shape.y + shape.h);
    }
  }
  const overflow = minX < 0 || minY < 0 || maxX > 1 || maxY > 1;
  const pad = extraPad + (overflow ? STROKE_PAD : 0);
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

/** Dialog workspace: always a margin around the photo, expanded if shapes already sit further out. */
export function editorWorkspaceExtent(
  drawing: ImageDrawing | null | undefined
): DrawingExtent {
  const inner = drawingExtent(drawing);
  return {
    minX: Math.min(inner.minX, -EDITOR_DRAWING_PAD),
    minY: Math.min(inner.minY, -EDITOR_DRAWING_PAD),
    maxX: Math.max(inner.maxX, 1 + EDITOR_DRAWING_PAD),
    maxY: Math.max(inner.maxY, 1 + EDITOR_DRAWING_PAD),
  };
}

/** Pixel padding to add around the source raster so overflow ink is not clipped. */
export function flattenPixelPad(
  extent: DrawingExtent,
  width: number,
  height: number
): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.max(0, Math.ceil(-extent.minX * width)),
    top: Math.max(0, Math.ceil(-extent.minY * height)),
    right: Math.max(0, Math.ceil((extent.maxX - 1) * width)),
    bottom: Math.max(0, Math.ceil((extent.maxY - 1) * height)),
  };
}

function asColor(value: unknown): string {
  if (typeof value !== "string") return DRAWING_DEFAULT_COLOR;
  const trimmed = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)
    ? trimmed
    : DRAWING_DEFAULT_COLOR;
}

function asId(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

export function emptyImageDrawing(): ImageDrawing {
  return { version: DRAWING_OVERLAY_VERSION, shapes: [] };
}

export function isEmptyImageDrawing(
  drawing: ImageDrawing | null | undefined
): boolean {
  return !drawing || drawing.shapes.length === 0;
}

export function drawingLabelTexts(drawing: ImageDrawing | null | undefined): string[] {
  if (!drawing) return [];
  return drawing.shapes.flatMap((shape) =>
    shape.type === "label" && shape.text.trim() ? [shape.text.trim()] : []
  );
}

/** Short card / list_suggestions line for an overlay. */
export function drawingPreviewSummary(
  drawing: ImageDrawing | null | undefined
): string {
  const labels = drawingLabelTexts(drawing);
  if (labels.length === 0) return "Clear figure annotations";
  return `Annotate: ${labels.join(", ")}`;
}

function parseArrow(raw: Record<string, unknown>, index: number): DrawingArrow | null {
  if (raw.type !== "arrow") return null;
  return {
    id: asId(raw.id, `arrow-${index + 1}`),
    type: "arrow",
    x1: clampCoord(Number(raw.x1)),
    y1: clampCoord(Number(raw.y1)),
    x2: clampCoord(Number(raw.x2)),
    y2: clampCoord(Number(raw.y2)),
    color: asColor(raw.color),
  };
}

function parseLabel(raw: Record<string, unknown>, index: number): DrawingLabel | null {
  if (raw.type !== "label") return null;
  const text = typeof raw.text === "string" ? raw.text : "";
  return {
    id: asId(raw.id, `label-${index + 1}`),
    type: "label",
    x: clampCoord(Number(raw.x)),
    y: clampCoord(Number(raw.y)),
    w: clampDim(Number(raw.w), 0.16),
    h: clampDim(Number(raw.h), 0.06),
    text,
    color: asColor(raw.color),
  };
}

export function parseImageDrawing(raw: unknown): ImageDrawing | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const shapesRaw = Array.isArray(record.shapes) ? record.shapes : [];
  const shapes: DrawingShape[] = [];
  for (let i = 0; i < shapesRaw.length; i++) {
    const item = shapesRaw[i];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const arrow = parseArrow(rec, i);
    if (arrow) {
      shapes.push(arrow);
      continue;
    }
    const label = parseLabel(rec, i);
    if (label) shapes.push(label);
  }
  if (shapes.length === 0 && record.version == null && !Array.isArray(record.shapes)) {
    return null;
  }
  return { version: DRAWING_OVERLAY_VERSION, shapes };
}

export function drawingEquals(
  a: ImageDrawing | null | undefined,
  b: ImageDrawing | null | undefined
): boolean {
  return JSON.stringify(a ?? emptyImageDrawing()) === JSON.stringify(b ?? emptyImageDrawing());
}

/**
 * Stack callout boxes down the left margin (outside the photo), arrows
 * pointing into the equipment — the 3xper swab pictorial layout.
 */
export function layoutCalloutsLeft(callouts: readonly DrawingCallout[]): ImageDrawing {
  const items = callouts
    .map((item) => ({
      text: item.text.trim(),
      tipX: item.tipX,
      tipY: item.tipY,
    }))
    .filter((item) => item.text.length > 0)
    .slice(0, 24);
  if (items.length === 0) return emptyImageDrawing();

  const count = items.length;
  const top = 0.08;
  const bottom = 0.92;
  const span = Math.max(0.2, bottom - top);
  const slot = span / count;
  const labelW = 0.22;
  const labelH = Math.min(0.09, Math.max(0.045, slot * 0.72));
  const gap = 0.03;
  const x = -(labelW + gap);
  const shapes: DrawingShape[] = [];

  items.forEach((item, index) => {
    const hasTip =
      typeof item.tipX === "number" &&
      Number.isFinite(item.tipX) &&
      typeof item.tipY === "number" &&
      Number.isFinite(item.tipY);
    const tipX = hasTip ? clamp01(item.tipX!) : 0.58;
    const tipY = hasTip ? clamp01(item.tipY!) : top + slot * (index + 0.5);
    const y = tipY - labelH / 2;
    const id = `callout-${index + 1}`;
    shapes.push({
      id: `${id}-label`,
      type: "label",
      x,
      y,
      w: labelW,
      h: labelH,
      text: item.text,
      color: DRAWING_DEFAULT_COLOR,
    });
    shapes.push({
      id: `${id}-arrow`,
      type: "arrow",
      x1: x + labelW,
      y1: y + labelH / 2,
      x2: tipX,
      y2: tipY,
      color: DRAWING_DEFAULT_COLOR,
    });
  });

  return { version: DRAWING_OVERLAY_VERSION, shapes };
}

export type DrawingOperation = {
  /** 1-based imageInline index in the field. */
  index: number;
  drawing: ImageDrawing;
};

export function parseDrawingOperation(raw: unknown): DrawingOperation | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const index = record.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 1) {
    return undefined;
  }
  const drawing = parseImageDrawing(record.drawing);
  if (!drawing) return undefined;
  return { index, drawing };
}

export function newDrawingShapeId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}
