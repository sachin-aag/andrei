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

type CalloutSide = "left" | "right" | "top" | "bottom";

const LABEL_GAP = 0.03;
const LABEL_STACK_GAP = 0.02;
/** Prefer left/right labels unless the tip is clearly nearer the top or bottom. */
const HORIZ_PREF = 0.08;
/** Slight left bias so a center tip still follows the 3xper left-margin convention. */
const LEFT_BIAS = 0.04;
const CROWD_PENALTY = 0.07;

type PlacedCallout = {
  index: number;
  text: string;
  tipX: number;
  tipY: number;
  w: number;
  h: number;
  side: CalloutSide;
  x: number;
  y: number;
};

function measureLabel(text: string): { w: number; h: number } {
  const lines = text.split(/\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const count = Math.max(1, lines.length);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 1);
  return {
    w: Math.min(0.36, Math.max(0.16, 0.10 + longest * 0.011)),
    h: Math.min(0.14, Math.max(0.05, 0.024 + count * 0.028)),
  };
}

function hasExplicitTip(item: { tipX?: number; tipY?: number }): boolean {
  return (
    typeof item.tipX === "number" &&
    Number.isFinite(item.tipX) &&
    typeof item.tipY === "number" &&
    Number.isFinite(item.tipY)
  );
}

function defaultTip(index: number, count: number): { x: number; y: number } {
  if (count <= 1) return { x: 0.58, y: 0.5 };
  const top = 0.16;
  const bottom = 0.84;
  const span = Math.max(0.2, bottom - top);
  return { x: 0.58, y: top + (span * (index + 0.5)) / count };
}

function pickSide(
  tipX: number,
  tipY: number,
  counts: Record<CalloutSide, number>
): CalloutSide {
  const dLeft = tipX;
  const dRight = 1 - tipX;
  const dTop = tipY;
  const dBottom = 1 - tipY;
  const crowd = (side: CalloutSide) => counts[side] * CROWD_PENALTY;
  const horiz = Math.min(dLeft, dRight);
  const vert = Math.min(dTop, dBottom);
  if (vert + HORIZ_PREF < horiz) {
    const topScore = dTop + crowd("top");
    const bottomScore = dBottom + crowd("bottom");
    return topScore <= bottomScore ? "top" : "bottom";
  }
  const leftScore = dLeft + crowd("left") - LEFT_BIAS;
  const rightScore = dRight + crowd("right");
  return leftScore <= rightScore ? "left" : "right";
}

function packAlong(
  desired: number[],
  sizes: number[],
  min: number,
  max: number
): number[] {
  const n = desired.length;
  if (n === 0) return [];
  const order = desired.map((_, i) => i).toSorted((a, b) => desired[a]! - desired[b]!);
  const total = sizes.reduce((sum, size) => sum + size, 0) + LABEL_STACK_GAP * (n - 1);
  let lo = min;
  let hi = max;
  if (total > hi - lo) {
    const extra = (total - (hi - lo)) / 2;
    lo -= extra;
    hi += extra;
  }
  const pos = desired.map((value) => value);
  let cursor = lo;
  for (const i of order) {
    pos[i] = Math.max(pos[i]!, cursor);
    cursor = pos[i]! + sizes[i]! + LABEL_STACK_GAP;
  }
  const last = order[n - 1]!;
  if (pos[last]! + sizes[last]! <= hi) return pos;
  cursor = hi;
  for (let k = n - 1; k >= 0; k--) {
    const i = order[k]!;
    const start = cursor - sizes[i]!;
    pos[i] = Math.min(pos[i]!, start);
    cursor = pos[i]! - LABEL_STACK_GAP;
  }
  if (pos[order[0]!]! >= lo) return pos;
  let t = lo + Math.max(0, (hi - lo - total) / 2);
  for (const i of order) {
    pos[i] = t;
    t += sizes[i]! + LABEL_STACK_GAP;
  }
  return pos;
}

function placeOnSide(item: PlacedCallout): void {
  switch (item.side) {
    case "left":
      item.x = -(item.w + LABEL_GAP);
      item.y = item.tipY - item.h / 2;
      return;
    case "right":
      item.x = 1 + LABEL_GAP;
      item.y = item.tipY - item.h / 2;
      return;
    case "top":
      item.x = item.tipX - item.w / 2;
      item.y = -(item.h + LABEL_GAP);
      return;
    case "bottom":
      item.x = item.tipX - item.w / 2;
      item.y = 1 + LABEL_GAP;
      return;
    default: {
      const _never: never = item.side;
      return _never;
    }
  }
}

function packSide(items: PlacedCallout[]): void {
  if (items.length === 0) return;
  const side = items[0]!.side;
  const alongY = side === "left" || side === "right";
  const desired = items.map((item) => (alongY ? item.y : item.x));
  const sizes = items.map((item) => (alongY ? item.h : item.w));
  const packed = packAlong(desired, sizes, -0.12, 1.12);
  items.forEach((item, i) => {
    if (alongY) item.y = packed[i]!;
    else item.x = packed[i]!;
  });
}

function arrowStart(item: PlacedCallout): { x1: number; y1: number } {
  switch (item.side) {
    case "left":
      return { x1: item.x + item.w, y1: item.y + item.h / 2 };
    case "right":
      return { x1: item.x, y1: item.y + item.h / 2 };
    case "top":
      return { x1: item.x + item.w / 2, y1: item.y + item.h };
    case "bottom":
      return { x1: item.x + item.w / 2, y1: item.y };
    default: {
      const _never: never = item.side;
      return _never;
    }
  }
}

/**
 * Place callout boxes in the margin outside the photo, arrows pointing at
 * the equipment. No tip → 3xper left stack. Explicit tips hug the nearest
 * outer edge (left/right, or top/bottom when clearly closer) so labels do
 * not cover the picture and arrows stay short. Same-side labels are packed
 * so they do not overlap.
 */
export function layoutCallouts(callouts: readonly DrawingCallout[]): ImageDrawing {
  const items = callouts
    .map((item) => ({
      text: item.text.trim(),
      tipX: item.tipX,
      tipY: item.tipY,
    }))
    .filter((item) => item.text.length > 0)
    .slice(0, 24);
  if (items.length === 0) return emptyImageDrawing();

  const counts: Record<CalloutSide, number> = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  };
  const placed: PlacedCallout[] = items.map((item, index) => {
    const size = measureLabel(item.text);
    const explicit = hasExplicitTip(item);
    const fallback = defaultTip(index, items.length);
    const tipX = explicit ? clamp01(item.tipX!) : fallback.x;
    const tipY = explicit ? clamp01(item.tipY!) : fallback.y;
    const side = explicit ? pickSide(tipX, tipY, counts) : "left";
    counts[side] += 1;
    const row: PlacedCallout = {
      index,
      text: item.text,
      tipX,
      tipY,
      w: size.w,
      h: size.h,
      side,
      x: 0,
      y: 0,
    };
    placeOnSide(row);
    return row;
  });

  const bySide: Record<CalloutSide, PlacedCallout[]> = {
    left: [],
    right: [],
    top: [],
    bottom: [],
  };
  for (const row of placed) bySide[row.side].push(row);
  packSide(bySide.left);
  packSide(bySide.right);
  packSide(bySide.top);
  packSide(bySide.bottom);

  const shapes: DrawingShape[] = [];
  for (const row of placed) {
    const id = `callout-${row.index + 1}`;
    const start = arrowStart(row);
    shapes.push({
      id: `${id}-label`,
      type: "label",
      x: row.x,
      y: row.y,
      w: row.w,
      h: row.h,
      text: row.text,
      color: DRAWING_DEFAULT_COLOR,
    });
    shapes.push({
      id: `${id}-arrow`,
      type: "arrow",
      x1: start.x1,
      y1: start.y1,
      x2: row.tipX,
      y2: row.tipY,
      color: DRAWING_DEFAULT_COLOR,
    });
  }

  return { version: DRAWING_OVERLAY_VERSION, shapes };
}

/** @see layoutCallouts */
export function layoutCalloutsLeft(
  callouts: readonly DrawingCallout[]
): ImageDrawing {
  return layoutCallouts(callouts);
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
