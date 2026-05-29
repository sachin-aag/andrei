import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { findPlaceholdersInPmDoc } from "@/lib/placeholders/find";

describe("findPlaceholdersInPmDoc", () => {
  it("maps positions at text-node chunk boundaries", () => {
    const schema = new Schema({
      nodes: {
        doc: { content: "paragraph" },
        paragraph: { content: "text*", group: "block" },
        text: { group: "inline" },
      },
    });

    const prefix = "Scope is ";
    const placeholder = "[Impacted batches/materials: <to be filled>]";
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text(prefix),
        schema.text(placeholder),
        schema.text("."),
      ]),
    ]);

    const [found] = findPlaceholdersInPmDoc(doc, "define", "narrative");
    expect(found?.text).toBe(placeholder);
    expect(doc.textBetween(found!.fromPos, found!.toPos)).toBe(placeholder);
  });
});
