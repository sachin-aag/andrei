// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DrawingEditorDialog } from "@/components/report/drawing-editor-dialog";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 300,
    width: 400,
    height: 300,
    toJSON: () => ({}),
  });
});

describe("DrawingEditorDialog", () => {
  it("places a label on the figure and saves it", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <DrawingEditorDialog
        open
        src={PNG}
        alt="vessel"
        initialDrawing={null}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    );

    expect(screen.getByTestId("drawing-editor")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Label" }));
    await user.pointer({
      keys: "[MouseLeft]",
      target: screen.getByTestId("drawing-canvas"),
      coords: { clientX: 80, clientY: 60 },
    });
    const input = await screen.findByLabelText("Callout text");
    await user.type(input, "S-1");
    await user.click(screen.getByRole("button", { name: "Save drawing" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const drawing = onSave.mock.calls[0]![0] as {
      shapes: Array<{ type: string; text?: string }>;
    };
    expect(drawing.shapes.some((shape) => shape.type === "label" && shape.text === "S-1")).toBe(
      true
    );
  });

  it("places a label in the margin outside the photo", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <DrawingEditorDialog
        open
        src={PNG}
        alt="vessel"
        initialDrawing={null}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole("button", { name: "Label" }));
    await user.pointer({
      keys: "[MouseLeft]",
      target: screen.getByTestId("drawing-canvas"),
      coords: { clientX: 20, clientY: 150 },
    });
    await user.click(screen.getByRole("button", { name: "Save drawing" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const drawing = onSave.mock.calls[0]![0] as {
      shapes: Array<{ type: string; x?: number }>;
    };
    const label = drawing.shapes.find((shape) => shape.type === "label");
    expect(label?.x).toBeLessThan(0);
  });
});
