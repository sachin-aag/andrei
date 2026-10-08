import type { DrawingShape, ImageDrawing } from "@/lib/drawings/overlay";

/** Minimal 2d surface — DOM canvas and @napi-rs/canvas both qualify. */
export type DrawingPaintContext = {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: string;
  lineCap: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  closePath: () => void;
  stroke: () => void;
  fill: () => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  strokeRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (text: string, x: number, y: number, maxWidth?: number) => void;
  measureText?: (text: string) => { width: number };
};

function wrapLines(
  ctx: DrawingPaintContext,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim() ? paragraph.trim().split(/\s+/) : [""];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      const width = ctx.measureText?.(next).width ?? next.length * 8;
      if (width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

function paintArrow(
  ctx: DrawingPaintContext,
  shape: Extract<DrawingShape, { type: "arrow" }>,
  width: number,
  height: number
): void {
  const x1 = shape.x1 * width;
  const y1 = shape.y1 * height;
  const x2 = shape.x2 * width;
  const y2 = shape.y2 * height;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(10, Math.min(width, height) * 0.018);
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = Math.max(2, Math.min(width, height) * 0.004);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - head * Math.cos(angle - Math.PI / 7),
    y2 - head * Math.sin(angle - Math.PI / 7)
  );
  ctx.lineTo(
    x2 - head * Math.cos(angle + Math.PI / 7),
    y2 - head * Math.sin(angle + Math.PI / 7)
  );
  ctx.closePath();
  ctx.fill();
}

function paintLabel(
  ctx: DrawingPaintContext,
  shape: Extract<DrawingShape, { type: "label" }>,
  width: number,
  height: number
): void {
  const x = shape.x * width;
  const y = shape.y * height;
  const w = Math.max(24, shape.w * width);
  const h = Math.max(18, shape.h * height);
  const pad = Math.max(4, Math.min(w, h) * 0.08);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = Math.max(2, Math.min(width, height) * 0.0035);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  const fontPx = Math.max(11, Math.min(18, h * 0.38));
  ctx.font = `600 ${fontPx}px "Times New Roman", Times, serif`;
  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrapLines(ctx, shape.text || " ", w - pad * 2);
  const lineHeight = fontPx * 1.15;
  const block = lines.length * lineHeight;
  const startY = y + h / 2 - block / 2 + lineHeight / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, x + w / 2, startY + index * lineHeight, w - pad * 2);
  });
}

export function paintDrawing(
  ctx: DrawingPaintContext,
  drawing: ImageDrawing,
  width: number,
  height: number
): void {
  for (const shape of drawing.shapes) {
    if (shape.type === "arrow") paintArrow(ctx, shape, width, height);
    else paintLabel(ctx, shape, width, height);
  }
}
