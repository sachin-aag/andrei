import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import {
  findPlaceholders,
  findPlaceholdersInPmDoc,
} from "@/lib/placeholders/find";

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

describe("findPlaceholders JSON vs ProseMirror", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { content: "inline*", group: "block" },
      bulletList: { content: "listItem+", group: "block" },
      listItem: { content: "block+" },
      text: { group: "inline" },
    },
  });

  it("agrees on count and positions for a paragraph", () => {
    const text = "Batch [Batch No.: <to be filled>] and analyst <name>.";
    const json: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    };
    const pm = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text(text)]),
    ]);

    const fromJson = findPlaceholders(json, "define", "narrative");
    const fromPm = findPlaceholdersInPmDoc(pm, "define", "narrative");
    expect(fromJson.map((p) => ({ fromPos: p.fromPos, text: p.text }))).toEqual(
      fromPm.map((p) => ({ fromPos: p.fromPos, text: p.text }))
    );
  });

  it("agrees on count and positions inside a list item", () => {
    const text = "Started on <start date>.";
    const json: JSONContent = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text }] },
              ],
            },
          ],
        },
      ],
    };
    const pm = schema.node("doc", null, [
      schema.node("bulletList", null, [
        schema.node("listItem", null, [
          schema.node("paragraph", null, [schema.text(text)]),
        ]),
      ]),
    ]);

    const fromJson = findPlaceholders(json, "define", "narrative");
    const fromPm = findPlaceholdersInPmDoc(pm, "define", "narrative");
    expect(fromJson).toHaveLength(1);
    expect(fromJson.map((p) => ({ fromPos: p.fromPos, text: p.text }))).toEqual(
      fromPm.map((p) => ({ fromPos: p.fromPos, text: p.text }))
    );
  });
});
