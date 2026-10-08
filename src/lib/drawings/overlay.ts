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
  /** Optional arrow tip on the figure, 0–1. */
  tipX?: number;
  tipY?: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampDim(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(1, value);
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
    x1: clamp01(Number(raw.x1)),
    y1: clamp01(Number(raw.y1)),
    x2: clamp01(Number(raw.x2)),
    y2: clamp01(Number(raw.y2)),
    color: asColor(raw.color),
  };
}

function parseLabel(raw: Record<string, unknown>, index: number): DrawingLabel | null {
  if (raw.type !== "label") return null;
  const text = typeof raw.text === "string" ? raw.text : "";
  return {
    id: asId(raw.id, `label-${index + 1}`),
    type: "label",
    x: clamp01(Number(raw.x)),
    y: clamp01(Number(raw.y)),
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
 * Stack callout boxes down the left of the figure, arrows pointing into the
 * right-hand equipment — the 3xper swab pictorial layout.
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
  const shapes: DrawingShape[] = [];

  items.forEach((item, index) => {
    const hasTip =
      typeof item.tipX === "number" &&
      Number.isFinite(item.tipX) &&
      typeof item.tipY === "number" &&
      Number.isFinite(item.tipY);
    const tipX = hasTip ? clamp01(item.tipX!) : 0.58;
    const tipY = hasTip ? clamp01(item.tipY!) : top + slot * (index + 0.5);
    const y = clamp01(tipY - labelH / 2);
    const x = 0.03;
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
