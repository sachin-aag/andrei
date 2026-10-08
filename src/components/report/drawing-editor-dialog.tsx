"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowUpRight, MousePointer2, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DrawingComposedFigure } from "@/components/report/tiptap/drawing-overlay";
import {
  DRAWING_DEFAULT_COLOR,
  editorWorkspaceExtent,
  emptyImageDrawing,
  newDrawingShapeId,
  type DrawingExtent,
  type DrawingShape,
  type ImageDrawing,
} from "@/lib/drawings/overlay";
import { cn } from "@/lib/utils";

type Tool = "select" | "arrow" | "label";

type DrawingEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  alt?: string;
  initialDrawing: ImageDrawing | null;
  onSave: (drawing: ImageDrawing) => void;
};

function hitTest(
  drawing: ImageDrawing,
  x: number,
  y: number
): DrawingShape | null {
  for (let i = drawing.shapes.length - 1; i >= 0; i--) {
    const shape = drawing.shapes[i]!;
    if (shape.type === "label") {
      if (x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h) {
        return shape;
      }
      continue;
    }
    const dx = shape.x2 - shape.x1;
    const dy = shape.y2 - shape.y1;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - shape.x1) * dx + (y - shape.y1) * dy) / len2));
    const px = shape.x1 + t * dx;
    const py = shape.y1 + t * dy;
    const dist = Math.hypot(x - px, y - py);
    if (dist < 0.02) return shape;
  }
  return null;
}

function arrowHandle(
  shape: Extract<DrawingShape, { type: "arrow" }>,
  x: number,
  y: number
): "start" | "end" | null {
  if (Math.hypot(x - shape.x1, y - shape.y1) < 0.025) return "start";
  if (Math.hypot(x - shape.x2, y - shape.y2) < 0.025) return "end";
  return null;
}

export function DrawingEditorDialog({
  open,
  onOpenChange,
  src,
  alt,
  initialDrawing,
  onSave,
}: DrawingEditorDialogProps) {
  const [tool, setTool] = useState<Tool>("select");
  const [drawing, setDrawing] = useState<ImageDrawing>(
    initialDrawing ?? emptyImageDrawing()
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const frameRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<DrawingExtent>(
    editorWorkspaceExtent(initialDrawing)
  );
  const [workspace, setWorkspace] = useState<DrawingExtent>(() =>
    editorWorkspaceExtent(initialDrawing)
  );
  const dragRef = useRef<{
    id: string;
    kind: "move" | "start" | "end" | "create-arrow";
    ox: number;
    oy: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextDrawing = initialDrawing ?? emptyImageDrawing();
    const nextWorkspace = editorWorkspaceExtent(nextDrawing);
    setDrawing(nextDrawing);
    setWorkspace(nextWorkspace);
    workspaceRef.current = nextWorkspace;
    setSelectedId(null);
    setTool("select");
    setDraftText("");
  }, [open, initialDrawing]);

  const selected = useMemo(
    () => drawing.shapes.find((shape) => shape.id === selectedId) ?? null,
    [drawing, selectedId]
  );

  useEffect(() => {
    setDraftText(selected?.type === "label" ? selected.text : "");
  }, [selected]);

  const pointFromEvent = useCallback((event: React.PointerEvent) => {
    const el = frameRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const extent = workspaceRef.current;
    const spanX = extent.maxX - extent.minX;
    const spanY = extent.maxY - extent.minY;
    const x = extent.minX + ((event.clientX - rect.left) / rect.width) * spanX;
    const y = extent.minY + ((event.clientY - rect.top) / rect.height) * spanY;
    return {
      x: Math.min(extent.maxX, Math.max(extent.minX, x)),
      y: Math.min(extent.maxY, Math.max(extent.minY, y)),
    };
  }, []);

  const updateShape = useCallback((id: string, patch: Partial<DrawingShape>) => {
    setDrawing((current) => ({
      ...current,
      shapes: current.shapes.map((shape) =>
        shape.id === id ? ({ ...shape, ...patch } as DrawingShape) : shape
      ),
    }));
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = pointFromEvent(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "arrow") {
      const id = newDrawingShapeId("arrow");
      const arrow: DrawingShape = {
        id,
        type: "arrow",
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y,
        color: DRAWING_DEFAULT_COLOR,
      };
      setDrawing((current) => ({ ...current, shapes: [...current.shapes, arrow] }));
      setSelectedId(id);
      dragRef.current = { id, kind: "create-arrow", ox: point.x, oy: point.y };
      return;
    }

    if (tool === "label") {
      const id = newDrawingShapeId("label");
      const w = 0.18;
      const h = 0.07;
      const extent = workspaceRef.current;
      const label: DrawingShape = {
        id,
        type: "label",
        x: Math.min(extent.maxX - w, Math.max(extent.minX, point.x - w / 2)),
        y: Math.min(extent.maxY - h, Math.max(extent.minY, point.y - h / 2)),
        w,
        h,
        text: "",
        color: DRAWING_DEFAULT_COLOR,
      };
      setDrawing((current) => ({ ...current, shapes: [...current.shapes, label] }));
      setSelectedId(id);
      setTool("select");
      return;
    }

    const hit = hitTest(drawing, point.x, point.y);
    setSelectedId(hit?.id ?? null);
    if (!hit) return;
    if (hit.type === "arrow") {
      const handle = arrowHandle(hit, point.x, point.y);
      dragRef.current = {
        id: hit.id,
        kind: handle ?? "move",
        ox: point.x,
        oy: point.y,
      };
      return;
    }
    dragRef.current = { id: hit.id, kind: "move", ox: point.x, oy: point.y };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const point = pointFromEvent(event);
    if (!drag || !point) return;
    setDrawing((current) => {
      const shape = current.shapes.find((item) => item.id === drag.id);
      if (!shape) return current;
      if (shape.type === "arrow") {
        let next: DrawingShape = shape;
        if (drag.kind === "start") {
          next = { ...shape, x1: point.x, y1: point.y };
        } else if (drag.kind === "end" || drag.kind === "create-arrow") {
          next = { ...shape, x2: point.x, y2: point.y };
        } else {
          const dx = point.x - drag.ox;
          const dy = point.y - drag.oy;
          const extent = workspaceRef.current;
          next = {
            ...shape,
            x1: Math.min(extent.maxX, Math.max(extent.minX, shape.x1 + dx)),
            y1: Math.min(extent.maxY, Math.max(extent.minY, shape.y1 + dy)),
            x2: Math.min(extent.maxX, Math.max(extent.minX, shape.x2 + dx)),
            y2: Math.min(extent.maxY, Math.max(extent.minY, shape.y2 + dy)),
          };
        }
        return {
          ...current,
          shapes: current.shapes.map((item) => (item.id === shape.id ? next : item)),
        };
      }
      const dx = point.x - drag.ox;
      const dy = point.y - drag.oy;
      const extent = workspaceRef.current;
      return {
        ...current,
        shapes: current.shapes.map((item) =>
          item.id === shape.id
            ? {
                ...shape,
                x: Math.min(extent.maxX - shape.w, Math.max(extent.minX, shape.x + dx)),
                y: Math.min(extent.maxY - shape.h, Math.max(extent.minY, shape.y + dy)),
              }
            : item
        ),
      };
    });
    drag.ox = point.x;
    drag.oy = point.y;
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setDrawing((current) => ({
      ...current,
      shapes: current.shapes.filter((shape) => shape.id !== selectedId),
    }));
    setSelectedId(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      event.preventDefault();
      setDrawing((current) => ({
        ...current,
        shapes: current.shapes.filter((shape) => shape.id !== selectedId),
      }));
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selectedId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] w-[min(96vw,1100px)] max-w-none flex-col gap-3 p-4"
        data-testid="drawing-editor"
      >
        <DialogHeader>
          <DialogTitle>Annotate figure</DialogTitle>
          <DialogDescription>
            Add arrows and labels on or around the picture. The checkerboard
            around the photo is drawable. Save scales the figure so outside
            annotations stay visible.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1">
          <ToolButton
            active={tool === "select"}
            onClick={() => setTool("select")}
            label="Select"
          >
            <MousePointer2 className="size-3.5" />
            Select
          </ToolButton>
          <ToolButton
            active={tool === "arrow"}
            onClick={() => setTool("arrow")}
            label="Arrow"
          >
            <ArrowUpRight className="size-3.5" />
            Arrow
          </ToolButton>
          <ToolButton
            active={tool === "label"}
            onClick={() => setTool("label")}
            label="Label"
          >
            <Type className="size-3.5" />
            Label
          </ToolButton>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={!selectedId}
            onClick={deleteSelected}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
          {selected?.type === "label" ? (
            <input
              className="ml-2 h-8 min-w-[12rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
              value={draftText}
              placeholder="S-1"
              aria-label="Callout text"
              onChange={(event) => {
                const text = event.target.value;
                setDraftText(text);
                updateShape(selected.id, { text });
              }}
            />
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md border border-[var(--border)] bg-neutral-100 p-3">
          <DrawingComposedFigure
            src={src}
            alt={alt}
            drawing={drawing}
            selectedId={selectedId}
            extent={workspace}
            surface="checkerboard"
            photoOutline
            frameRef={frameRef}
            testId="drawing-canvas"
            className={cn(
              "max-h-[min(62vh,720px)]",
              tool === "arrow" && "cursor-crosshair",
              tool === "label" && "cursor-cell"
            )}
            imgClassName="pointer-events-none max-h-[min(48vh,520px)] w-auto"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSave(drawing);
              onOpenChange(false);
            }}
          >
            Save drawing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="sm"
      className="h-8 gap-1 text-xs"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
