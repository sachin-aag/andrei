/**
 * Client-safe chat activity grouping. Collapses tool/reasoning parts into
 * Cursor-style surface lines with expandable detail.
 */

import type { UIMessage } from "ai";
import { sectionLabel as chatSectionLabelForType } from "@/lib/ai/chat/fields";
import type { SectionType } from "@/db/schema";
import {
  isDocumentReviewToolName,
  summarizeDocumentReviewProgress,
  type DocumentReviewToolPart,
} from "@/lib/ai/chat/document-review-ui";

export type ChatToolPartInfo = {
  toolName: string;
  state: string;
  toolCallId: string | undefined;
  input: Record<string, unknown> | undefined;
  output: Record<string, unknown> | undefined;
  errorText: string | undefined;
};

export type ActivityChildNode =
  | { kind: "thought"; text: string; pending: boolean }
  | { kind: "detail"; label: string; detail?: string; pending?: boolean };

export type ActivitySurfaceNode = {
  kind: "thought" | "documents" | "sections" | "edit" | "generic";
  label: string;
  pending: boolean;
  tone: "muted" | "success" | "warn";
  expandable: boolean;
  children: ActivityChildNode[];
  thoughtText?: string;
};

export type ChatActivityBlock =
  | { kind: "text"; text: string }
  | { kind: "document-review"; parts: DocumentReviewToolPart[] }
  | { kind: "ask-user"; tool: ChatToolPartInfo }
  | { kind: "activity"; node: ActivitySurfaceNode };

const DOCUMENT_ACTIVITY_TOOLS = new Set([
  "search_documents",
  "read_document_page",
  "document_outline",
  "scan_attachments",
]);

const EDIT_TOOLS = new Set([
  "propose_edit",
  "edit_table",
  "draft_field",
  "insert_image",
  "remove_image",
]);

export function readChatToolPart(
  part: UIMessage["parts"][number]
): ChatToolPartInfo | null {
  if (typeof part.type !== "string" || !part.type.startsWith("tool-")) return null;
  const p = part as {
    type: string;
    state?: string;
    toolCallId?: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    errorText?: string;
  };
  return {
    toolName: p.type.slice("tool-".length),
    state: p.state ?? "",
    toolCallId: typeof p.toolCallId === "string" ? p.toolCallId : undefined,
    input: p.input,
    output: p.output,
    errorText: p.errorText,
  };
}

export function isToolPending(info: ChatToolPartInfo): boolean {
  return info.state === "input-streaming" || info.state === "input-available";
}

function readReasoningPart(
  part: UIMessage["parts"][number]
): { text: string; pending: boolean } | null {
  if (part.type !== "reasoning") return null;
  const p = part as { text?: string; state?: string };
  const text = typeof p.text === "string" ? p.text.trim() : "";
  const pending = p.state === "streaming";
  if (!text && !pending) return null;
  return { text, pending };
}

function stringField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sectionLabel(section: unknown): string {
  if (typeof section === "string") return chatSectionLabelForType(section as SectionType);
  return "section";
}

export type AttachmentFilenameLookup = ReadonlyMap<string, string>;

function displayFilename(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const base = trimmed.replace(/^.*[/\\]/, "").trim();
  return base || trimmed;
}

function pushFilename(into: string[], raw: unknown): void {
  const value = stringField(raw);
  if (!value) return;
  const name = displayFilename(value);
  if (!name || into.includes(name)) return;
  into.push(name);
}

function filenamesFromRecord(record: Record<string, unknown>, into: string[]): void {
  pushFilename(into, record.filename);
  if (record.page && typeof record.page === "object" && !Array.isArray(record.page)) {
    pushFilename(into, (record.page as Record<string, unknown>).filename);
  }
  const citation = stringField(record.citation);
  if (citation) {
    const match = citation.match(/^\[([^,\]]+?)(?:,\s*p\.\s*\d+)?\]$/i);
    if (match?.[1]) pushFilename(into, match[1]);
  }
  if (Array.isArray(record.seenPages)) {
    for (const item of record.seenPages) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        pushFilename(into, (item as Record<string, unknown>).filename);
      }
    }
  }
  if (Array.isArray(record.results)) {
    for (const item of record.results) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        pushFilename(into, (item as Record<string, unknown>).filename);
      }
    }
  }
  if (Array.isArray(record.files)) {
    for (const item of record.files) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        pushFilename(into, (item as Record<string, unknown>).filename);
      }
    }
  }
}

function filenamesFromTool(
  info: ChatToolPartInfo,
  filenameById?: AttachmentFilenameLookup
): string[] {
  const names: string[] = [];
  if (info.output) filenamesFromRecord(info.output, names);
  if (info.input) filenamesFromRecord(info.input, names);

  const ids = [
    stringField(info.input?.attachmentId),
    stringField(info.output?.attachmentId),
  ];
  if (info.output?.page && typeof info.output.page === "object" && !Array.isArray(info.output.page)) {
    ids.push(stringField((info.output.page as Record<string, unknown>).attachmentId));
  }
  if (filenameById) {
    for (const id of ids) {
      if (!id) continue;
      const mapped = filenameById.get(id);
      if (mapped) pushFilename(names, mapped);
    }
  }
  return names;
}

function formatNameList(names: readonly string[]): string {
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function isDocumentActivityTool(toolName: string): boolean {
  return DOCUMENT_ACTIVITY_TOOLS.has(toolName);
}

function failureDetail(info: ChatToolPartInfo): string | undefined {
  const fromOutput =
    stringField(info.output?.hint) ??
    stringField(info.output?.message) ??
    stringField(info.errorText);
  return fromOutput ?? undefined;
}

function documentActivityDetail(
  info: ChatToolPartInfo,
  filenameById?: AttachmentFilenameLookup
): ActivityChildNode {
  const pending = isToolPending(info);
  const names = filenamesFromTool(info, filenameById);
  const named = names.length > 0 ? formatNameList(names) : null;
  switch (info.toolName) {
    case "search_documents":
      return {
        kind: "detail",
        label: named
          ? pending
            ? `Searching ${named}…`
            : `Searched ${named}`
          : pending
            ? "Searching attachments…"
            : "Searched attachments",
        pending,
      };
    case "scan_attachments":
      return {
        kind: "detail",
        label: named
          ? pending
            ? `Scanning ${named}…`
            : `Scanned ${named}`
          : pending
            ? "Scanning attachments…"
            : "Scanned attachments",
        pending,
      };
    case "document_outline":
      return {
        kind: "detail",
        label: named
          ? pending
            ? `Reading outline · ${named}…`
            : `Read outline · ${named}`
          : pending
            ? "Reading outline…"
            : "Read document outline",
        pending,
      };
    case "read_document_page": {
      const page =
        typeof info.input?.pageNumber === "number"
          ? info.input.pageNumber
          : typeof info.output?.pageNumber === "number"
            ? info.output.pageNumber
            : info.output?.page &&
                typeof info.output.page === "object" &&
                !Array.isArray(info.output.page) &&
                typeof (info.output.page as { pageNumber?: unknown }).pageNumber ===
                  "number"
              ? (info.output.page as { pageNumber: number }).pageNumber
              : null;
      const pageLabel = page != null ? `page ${page}` : "page";
      const label = named
        ? pending
          ? `Reading ${named} · ${pageLabel}…`
          : `Read ${named} · ${pageLabel}`
        : pending
          ? "Reading page…"
          : `Read ${pageLabel}`;
      return { kind: "detail", label, pending };
    }
    default:
      return { kind: "detail", label: info.toolName, pending };
  }
}

function countDocumentActivity(items: ActivityChildNode[]): {
  reads: number;
  searches: number;
} {
  let reads = 0;
  let searches = 0;
  for (const item of items) {
    if (item.kind !== "detail") continue;
    const label = item.label.toLowerCase();
    if (label.startsWith("search") || label.startsWith("scan")) {
      searches += 1;
    } else {
      reads += 1;
    }
  }
  return { reads, searches };
}

function documentsSurfaceLabel(input: {
  counts: { reads: number; searches: number };
  pending: boolean;
  filenames: readonly string[];
}): string {
  const { counts, pending, filenames } = input;
  if (filenames.length > 0 && filenames.length <= 2) {
    const named = formatNameList(filenames);
    if (pending) {
      return counts.reads > 0 ? `Reading ${named}…` : `Searching ${named}…`;
    }
    return counts.reads > 0 ? `Read ${named}` : `Searched ${named}`;
  }
  if (pending) {
    const total =
      filenames.length > 2
        ? filenames.length
        : counts.reads + counts.searches;
    if (total === 0) return "Searching attachments…";
    if (counts.reads > 0 && counts.searches > 0) {
      return `Searching and reading ${total} documents…`;
    }
    if (counts.reads > 0) {
      return `Reading ${total} document${total === 1 ? "" : "s"}…`;
    }
    return `Searching ${total} document${total === 1 ? "" : "s"}…`;
  }
  if (filenames.length > 2) {
    return `Read ${filenames.length} documents`;
  }
  const parts: string[] = [];
  if (counts.reads > 0) {
    parts.push(
      `Read ${counts.reads} page${counts.reads === 1 ? "" : "s"}`
    );
  }
  if (counts.searches > 0) {
    parts.push(
      `${counts.searches} search${counts.searches === 1 ? "" : "es"}`
    );
  }
  if (parts.length === 0) return "Explored attachments";
  if (counts.reads > 0 && counts.searches > 0) {
    return `Explored ${counts.reads} page${counts.reads === 1 ? "" : "s"}, ${counts.searches} search${counts.searches === 1 ? "" : "es"}`;
  }
  return parts.join(", ");
}

function buildDocumentsNode(
  children: ActivityChildNode[],
  filenames: readonly string[]
): ActivitySurfaceNode {
  const pending = children.some(
    (child) =>
      (child.kind === "detail" && child.pending) ||
      (child.kind === "thought" && child.pending)
  );
  const counts = countDocumentActivity(children);
  return {
    kind: "documents",
    label: documentsSurfaceLabel({ counts, pending, filenames }),
    pending,
    tone: "muted",
    expandable: children.length > 0,
    children,
  };
}

function buildThoughtNode(
  text: string,
  pending: boolean
): ActivitySurfaceNode {
  return {
    kind: "thought",
    label: pending ? "Thinking…" : "Thought",
    pending,
    tone: "muted",
    expandable: Boolean(text),
    children: text ? [{ kind: "thought", text, pending: false }] : [],
    thoughtText: text,
  };
}

function buildSectionReadsNode(tools: ChatToolPartInfo[]): ActivitySurfaceNode {
  const children: ActivityChildNode[] = tools.map((tool) => {
    const section = sectionLabel(tool.input?.section);
    const pending = isToolPending(tool);
    return {
      kind: "detail",
      label: pending ? `Reading ${section}…` : `Read ${section}`,
      pending,
    };
  });
  const pending = tools.some(isToolPending);
  const count = tools.length;
  return {
    kind: "sections",
    label: pending
      ? `Reading ${count} section${count === 1 ? "" : "s"}…`
      : `Read ${count} section${count === 1 ? "" : "s"}`,
    pending,
    tone: "muted",
    expandable: count > 1,
    children: count > 1 ? children : [],
  };
}

function buildEditNode(info: ChatToolPartInfo): ActivitySurfaceNode {
  const pending = isToolPending(info);
  const section = sectionLabel(info.input?.section);
  const field = stringField(info.input?.targetField);
  const status = info.output?.status;

  if (pending) {
    return {
      kind: "edit",
      label: "Editing…",
      pending: true,
      tone: "muted",
      expandable: false,
      children: [],
    };
  }

  if (status === "applied") {
    return {
      kind: "edit",
      label: field ? `Applied to ${section} · ${field}` : `Applied to ${section}`,
      pending: false,
      tone: "success",
      expandable: false,
      children: [],
    };
  }

  if (status === "proposed") {
    return {
      kind: "edit",
      label: `Proposed edit to ${section} — review it in the document`,
      pending: false,
      tone: "success",
      expandable: false,
      children: [],
    };
  }

  if (status === "drafted") {
    return {
      kind: "edit",
      label: `Drafted ${section}${field ? ` · ${field}` : ""} — review in the document`,
      pending: false,
      tone: "success",
      expandable: false,
      children: [],
    };
  }

  if (status === "not_a_rewrite") {
    return {
      kind: "edit",
      label: `Switching to a targeted edit on ${section}${field ? ` · ${field}` : ""}`,
      pending: false,
      tone: "muted",
      expandable: false,
      children: [],
    };
  }

  if (status === "available_plots") {
    return {
      kind: "edit",
      label: "Listed available Analytics plots",
      pending: false,
      tone: "muted",
      expandable: false,
      children: [],
    };
  }

  const detail = failureDetail(info);
  return {
    kind: "edit",
    label: "Edit attempted",
    pending: false,
    tone: "warn",
    expandable: Boolean(detail),
    children: detail ? [{ kind: "detail", label: detail }] : [],
  };
}

function analyticsActivityLabel(info: ChatToolPartInfo): ActivitySurfaceNode | null {
  const pending = isToolPending(info);
  switch (info.toolName) {
    case "read_worksheet":
      return {
        kind: "generic",
        label: pending ? "Reading worksheet…" : "Read worksheet",
        pending,
        tone: "muted",
        expandable: false,
        children: [],
      };
    case "extract_numeric_series": {
      const count =
        typeof info.output?.valueCount === "number" ? info.output.valueCount : null;
      if (pending) {
        return {
          kind: "generic",
          label: "Extracting numbers…",
          pending: true,
          tone: "muted",
          expandable: false,
          children: [],
        };
      }
      if (count && count > 0) {
        return {
          kind: "generic",
          label: `Extracted ${count} value${count === 1 ? "" : "s"}`,
          pending: false,
          tone: "success",
          expandable: false,
          children: [],
        };
      }
      const detail = stringField(info.output?.message) ?? "No numbers found";
      return {
        kind: "generic",
        label: "Could not extract numbers",
        pending: false,
        tone: "warn",
        expandable: true,
        children: [{ kind: "detail", label: detail }],
      };
    }
    case "write_column": {
      if (pending) {
        return {
          kind: "generic",
          label: "Writing column…",
          pending: true,
          tone: "muted",
          expandable: false,
          children: [],
        };
      }
      if (info.output?.status === "written") {
        return {
          kind: "generic",
          label: "Wrote column — check the worksheet",
          pending: false,
          tone: "success",
          expandable: false,
          children: [],
        };
      }
      const detail = stringField(info.output?.message) ?? "Could not write the column.";
      return {
        kind: "generic",
        label: "Edit attempted",
        pending: false,
        tone: "warn",
        expandable: true,
        children: [{ kind: "detail", label: detail }],
      };
    }
    case "manage_worksheet": {
      if (pending) {
        return {
          kind: "generic",
          label: "Updating worksheet…",
          pending: true,
          tone: "muted",
          expandable: false,
          children: [],
        };
      }
      if (info.output?.status === "ok") {
        return {
          kind: "generic",
          label:
            stringField(info.output.message) ?? "Updated the worksheet",
          pending: false,
          tone: "success",
          expandable: false,
          children: [],
        };
      }
      const detail = stringField(info.output?.message) ?? "Could not update the worksheet.";
      return {
        kind: "generic",
        label: "Edit attempted",
        pending: false,
        tone: "warn",
        expandable: true,
        children: [{ kind: "detail", label: detail }],
      };
    }
    case "run_capability_sixpack":
    case "run_one_way_anova":
    case "plot_xy_scatter":
    case "plot_boxplot":
    case "plot_histogram":
    case "plot_measurements": {
      const labels = analyticsPlotLabels(info.toolName, pending, info.output);
      return {
        kind: "generic",
        label: labels.surface,
        pending,
        tone: labels.tone,
        expandable: Boolean(labels.detail),
        children: labels.detail ? [{ kind: "detail", label: labels.detail }] : [],
      };
    }
    default:
      return null;
  }
}

function analyticsPlotLabels(
  toolName: string,
  pending: boolean,
  output: Record<string, unknown> | undefined
): { surface: string; tone: "muted" | "success" | "warn"; detail?: string } {
  if (pending) {
    switch (toolName) {
      case "run_capability_sixpack":
        return { surface: "Running sixpack…", tone: "muted" };
      case "run_one_way_anova":
        return { surface: "Running one-way ANOVA…", tone: "muted" };
      case "plot_xy_scatter":
        return { surface: "Plotting scatter…", tone: "muted" };
      case "plot_boxplot":
        return { surface: "Plotting boxplot…", tone: "muted" };
      case "plot_histogram":
        return { surface: "Plotting histogram…", tone: "muted" };
      case "plot_measurements":
        return { surface: "Plotting measurements…", tone: "muted" };
      default:
        return { surface: "Working…", tone: "muted" };
    }
  }
  if (output?.status === "ok") {
    switch (toolName) {
      case "run_capability_sixpack":
        return { surface: "Saved sixpack — open Results", tone: "success" };
      case "run_one_way_anova":
        return { surface: "Saved one-way ANOVA — open Results", tone: "success" };
      case "plot_xy_scatter":
        return {
          surface:
            output.updated === true
              ? "Updated plot — open Results"
              : "Saved scatter — open Results",
          tone: "success",
        };
      case "plot_boxplot":
        return {
          surface:
            output.updated === true
              ? "Updated boxplot — open Results"
              : "Saved boxplot — open Results",
          tone: "success",
        };
      case "plot_histogram":
        return {
          surface:
            output.updated === true
              ? "Updated histogram — open Results"
              : "Saved histogram — open Results",
          tone: "success",
        };
      case "plot_measurements":
        return { surface: "Saved scatter — open Results", tone: "success" };
      default:
        return { surface: "Saved — open Results", tone: "success" };
    }
  }
  return {
    surface: "Edit attempted",
    tone: "warn",
    detail: stringField(output?.message) ?? "Something went wrong.",
  };
}

function buildGenericNode(info: ChatToolPartInfo): ActivitySurfaceNode {
  const analytics = analyticsActivityLabel(info);
  if (analytics) return analytics;

  const pending = isToolPending(info);
  return {
    kind: "generic",
    label: pending ? `Running ${info.toolName}…` : info.toolName,
    pending,
    tone: "muted",
    expandable: Boolean(info.errorText),
    children: info.errorText
      ? [{ kind: "detail", label: info.errorText }]
      : [],
  };
}

function startsDocumentActivityRun(
  parts: UIMessage["parts"],
  index: number
): boolean {
  const part = parts[index]!;
  const tool = readChatToolPart(part);
  if (tool && isDocumentActivityTool(tool.toolName)) return true;
  if (!readReasoningPart(part)) return false;
  for (let i = index + 1; i < parts.length; i++) {
    const inner = parts[i]!;
    if (readReasoningPart(inner)) continue;
    if (inner.type === "text") return false;
    const innerTool = readChatToolPart(inner);
    if (!innerTool) return false;
    if (isDocumentReviewToolName(innerTool.toolName)) return false;
    if (innerTool.toolName === "read_section") return false;
    if (innerTool.toolName === "ask_user") return false;
    if (EDIT_TOOLS.has(innerTool.toolName)) return false;
    if (isDocumentActivityTool(innerTool.toolName)) return true;
    if (analyticsActivityLabel(innerTool)) return false;
    return false;
  }
  return false;
}

export function documentReviewActivityNode(
  parts: readonly DocumentReviewToolPart[]
): ActivitySurfaceNode | null {
  const snapshot = summarizeDocumentReviewProgress(parts);
  if (!snapshot) return null;
  const tone: ActivitySurfaceNode["tone"] =
    snapshot.phase === "complete"
      ? "success"
      : snapshot.phase === "error"
        ? "warn"
        : "muted";
  return {
    kind: "generic",
    label: snapshot.label,
    pending: snapshot.pending,
    tone,
    expandable: false,
    children: [],
  };
}

export function buildChatActivityBlocks(
  parts: UIMessage["parts"],
  filenameById?: AttachmentFilenameLookup
): ChatActivityBlock[] {
  const blocks: ChatActivityBlock[] = [];
  let reviewBuffer: DocumentReviewToolPart[] = [];
  let sectionReadBuffer: ChatToolPartInfo[] = [];

  const flushReview = () => {
    if (reviewBuffer.length === 0) return;
    blocks.push({ kind: "document-review", parts: reviewBuffer });
    reviewBuffer = [];
  };

  const flushSectionReads = () => {
    if (sectionReadBuffer.length === 0) return;
    if (sectionReadBuffer.length === 1) {
      const tool = sectionReadBuffer[0]!;
      const section = sectionLabel(tool.input?.section);
      const pending = isToolPending(tool);
      blocks.push({
        kind: "activity",
        node: {
          kind: "sections",
          label: pending ? `Reading ${section}…` : `Read ${section}`,
          pending,
          tone: "muted",
          expandable: false,
          children: [],
        },
      });
    } else {
      blocks.push({
        kind: "activity",
        node: buildSectionReadsNode(sectionReadBuffer),
      });
    }
    sectionReadBuffer = [];
  };

  let index = 0;
  while (index < parts.length) {
    const part = parts[index]!;

    if (part.type === "text") {
      flushReview();
      flushSectionReads();
      const text = (part as { text: string }).text;
      if (text.trim()) blocks.push({ kind: "text", text });
      index += 1;
      continue;
    }

    const tool = readChatToolPart(part);
    if (tool && isDocumentReviewToolName(tool.toolName)) {
      flushSectionReads();
      reviewBuffer.push({
        toolName: tool.toolName,
        state: tool.state,
        input: tool.input,
        output: tool.output,
      });
      index += 1;
      continue;
    }

    if (tool?.toolName === "read_section") {
      flushReview();
      sectionReadBuffer.push(tool);
      index += 1;
      continue;
    }

    if (tool?.toolName === "ask_user") {
      flushReview();
      flushSectionReads();
      blocks.push({ kind: "ask-user", tool });
      index += 1;
      continue;
    }

    if (startsDocumentActivityRun(parts, index)) {
      flushReview();
      flushSectionReads();
      const children: ActivityChildNode[] = [];
      const filenames: string[] = [];
      while (index < parts.length) {
        const inner = parts[index]!;
        const innerTool = readChatToolPart(inner);
        if (inner.type === "text") break;
        if (innerTool && isDocumentReviewToolName(innerTool.toolName)) break;
        if (innerTool?.toolName === "read_section") break;
        if (innerTool?.toolName === "ask_user") break;
        if (innerTool && EDIT_TOOLS.has(innerTool.toolName)) break;
        if (innerTool && !isDocumentActivityTool(innerTool.toolName)) {
          const analytics = analyticsActivityLabel(innerTool);
          if (analytics) break;
        }

        const reasoning = readReasoningPart(inner);
        if (reasoning) {
          children.push({
            kind: "thought",
            text: reasoning.text,
            pending: reasoning.pending,
          });
          index += 1;
          continue;
        }

        if (innerTool && isDocumentActivityTool(innerTool.toolName)) {
          children.push(documentActivityDetail(innerTool, filenameById));
          for (const name of filenamesFromTool(innerTool, filenameById)) {
            if (!filenames.includes(name)) filenames.push(name);
          }
          index += 1;
          continue;
        }

        break;
      }
      if (children.length > 0) {
        blocks.push({
          kind: "activity",
          node: buildDocumentsNode(children, filenames),
        });
      }
      continue;
    }

    if (tool && EDIT_TOOLS.has(tool.toolName)) {
      flushReview();
      flushSectionReads();
      blocks.push({ kind: "activity", node: buildEditNode(tool) });
      index += 1;
      continue;
    }

    const reasoning = readReasoningPart(part);
    if (reasoning) {
      flushReview();
      flushSectionReads();
      blocks.push({
        kind: "activity",
        node: buildThoughtNode(reasoning.text, reasoning.pending),
      });
      index += 1;
      continue;
    }

    if (tool) {
      flushReview();
      flushSectionReads();
      blocks.push({ kind: "activity", node: buildGenericNode(tool) });
      index += 1;
      continue;
    }

    index += 1;
  }

  flushReview();
  flushSectionReads();
  return blocks;
}
