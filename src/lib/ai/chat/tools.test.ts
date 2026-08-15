import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { buildChatTools } from "@/lib/ai/chat/tools";

vi.mock("@/db", () => ({ db: {} }));

type ZodToolSchema = z.ZodType<Record<string, unknown>>;

function inputSchemaOf(tools: ReturnType<typeof buildChatTools>, name: string) {
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool.inputSchema as unknown as ZodToolSchema;
}

function accepts(
  tools: ReturnType<typeof buildChatTools>,
  name: string,
  input: Record<string, unknown>
): boolean {
  return inputSchemaOf(tools, name).safeParse(input).success;
}

describe("buildChatTools search_documents scoping", () => {
  it("has no scope switch when nothing is tagged", () => {
    const tools = buildChatTools({ reportId: "report-1", canEdit: true });

    expect(
      accepts(tools, "search_documents", { query: "cleaning", limit: 5, scope: "all" })
    ).toBe(true);
    const parsed = inputSchemaOf(tools, "search_documents").parse({
      query: "cleaning",
    }) as Record<string, unknown>;
    expect(parsed.scope).toBeUndefined();
  });

  it("defaults to the tagged documents when some are tagged", () => {
    const tools = buildChatTools({
      reportId: "report-1",
      canEdit: true,
      pinnedAttachmentIds: ["att_1", "att_2"],
    });

    const parsed = inputSchemaOf(tools, "search_documents").parse({
      query: "cleaning",
    }) as Record<string, unknown>;
    expect(parsed.scope).toBe("tagged");
    expect(tools.search_documents?.description).toContain("2 document(s)");
    expect(
      accepts(tools, "search_documents", { query: "cleaning", scope: "all" })
    ).toBe(true);
    expect(
      accepts(tools, "search_documents", { query: "cleaning", scope: "everything" })
    ).toBe(false);
  });
});

describe("buildChatTools tagged sections", () => {
  it("keeps read_section limited to scope when nothing is tagged", () => {
    const tools = buildChatTools({
      reportId: "report-1",
      canEdit: true,
      sectionScope: "define",
    });

    expect(accepts(tools, "read_section", { section: "define" })).toBe(true);
    expect(accepts(tools, "read_section", { section: "control" })).toBe(false);
  });

  it("makes a tagged out-of-scope section readable", () => {
    const tools = buildChatTools({
      reportId: "report-1",
      canEdit: true,
      sectionScope: "define",
      mentionedSections: ["control"],
    });

    expect(accepts(tools, "read_section", { section: "control" })).toBe(true);
    expect(tools.read_section?.description).toContain("tagged control");
  });

  it("does not let a tagged section become editable", () => {
    const tools = buildChatTools({
      reportId: "report-1",
      canEdit: true,
      sectionScope: "define",
      mentionedSections: ["control"],
    });

    const edit = { section: "control", targetField: "narrative", markdown: "x", reasoning: "y" };
    expect(accepts(tools, "draft_field", edit)).toBe(false);
    expect(
      accepts(tools, "propose_edit", {
        section: "control",
        targetField: "narrative",
        reasoning: "y",
      })
    ).toBe(false);
    expect(
      accepts(tools, "draft_field", { ...edit, section: "define" })
    ).toBe(true);
  });
});
