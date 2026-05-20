import BulletList from "@tiptap/extension-bullet-list";

/** Bullet list with a `listStyle` attribute (`disc` filled circle, `dash` hyphen). */
export const BulletListWithStyle = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyle: {
        default: "disc",
        parseHTML: (element) =>
          element.getAttribute("data-list-style") === "dash" ? "dash" : "disc",
        renderHTML: (attributes) => ({
          "data-list-style": attributes.listStyle === "dash" ? "dash" : "disc",
        }),
      },
    };
  },
});
