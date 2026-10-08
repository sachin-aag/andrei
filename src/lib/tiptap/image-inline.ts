import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ImageInlineNodeView } from "@/components/report/tiptap/image-inline-node-view";
import { parseChartSpec, type ChartSpec } from "@/lib/charts/chart-spec";
import { parseImageDrawing, type ImageDrawing } from "@/lib/drawings/overlay";

export type ImageInlineAttrs = {
  src: string;
  alt?: string | null;
  width?: number | null;
  mediaId?: string | null;
  /** Agent-generated plot provenance. null on human photos. */
  chartSpec?: ChartSpec | null;
  /** Vector arrows/labels on top of the raster. */
  drawing?: ImageDrawing | null;
  /** Set while an Agent insert is pending review; stripped on accept. */
  suggestionId?: string | null;
  /** Pending Agent insert vs proposed deletion; omitted/null means a committed figure. */
  suggestionKind?: "insert" | "delete" | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageInline: {
      insertImageInline: (attrs: ImageInlineAttrs) => ReturnType;
    };
  }
}

export const ImageInline = Node.create({
  name: "imageInline",

  group: "inline",

  inline: true,

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      width: { default: null },
      mediaId: { default: null },
      suggestionId: { default: null },
      suggestionKind: { default: null },
      chartSpec: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-chart-spec");
          if (!raw) return null;
          try {
            return parseChartSpec(JSON.parse(raw) as unknown);
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const spec = parseChartSpec(attributes.chartSpec);
          if (!spec) return {};
          return { "data-chart-spec": JSON.stringify(spec) };
        },
      },
      drawing: {
        default: null,
        parseHTML: (element) => parseImageDrawing(element.getAttribute("data-drawing")),
        renderHTML: (attributes) => {
          const drawing = parseImageDrawing(attributes.drawing);
          if (!drawing || drawing.shapes.length === 0) return {};
          return { "data-drawing": JSON.stringify(drawing) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-image-inline="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        "data-image-inline": "true",
        class: "tiptap-image-inline",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageInlineNodeView);
  },

  addCommands() {
    return {
      insertImageInline:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
