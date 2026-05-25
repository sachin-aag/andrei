import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ImageInlineNodeView } from "@/components/report/tiptap/image-inline-node-view";

export type ImageInlineAttrs = {
  src: string;
  alt?: string | null;
  width?: number | null;
  mediaId?: string | null;
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
