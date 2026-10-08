/**
 * Agent wrap-up must not claim a fill that never returned proposed / drafted /
 * applied. Persist rewrites those sentences (and dumped markdown tables) so a
 * failed create_table cannot look like a landed card.
 */

import type { UIMessage } from "ai";
import { unwrapToolPayload } from "@/lib/ai/chat/search-loop";
import {
  toolNameFromPart,
  toolOutputFromPart,
} from "@/lib/ai/chat/citation-grounding";

export const UNLANDED_TABLE_NOTE =
  "No table card was proposed this turn.";

export const UNLANDED_WRITE_NOTE =
  "No document card was proposed this turn.";

const WRITE_TOOLS = new Set([
  "propose_edit",
  "edit_table",
  "draft_field",
  "draft_identity",
  "insert_image",
  "remove_image",
  "draft_rtm_table",
  "plot_measurements",
]);

const TABLE_TOOLS = new Set(["edit_table", "draft_rtm_table"]);

const LANDED = new Set(["proposed", "drafted", "applied"]);

const TABLE_CLAIM_RE =
  /\b(?:i(?:'ve| have)?|we)\s+(?:proposed|added|created|inserted|drafted|applied|made)\b[\s\S]{0,120}\btable\b/i;

const FILL_CLAIM_RE =
  /\b(?:i(?:'ve| have)?|we)\s+(?:proposed|added|created|inserted|drafted|applied|made a suggestion)\b/i;

const DENIAL_RE =
  /\b(?:could not|did not|didn't|cannot|can't|failed|not (?:propose|land|add|create)|nothing was)\b/i;

function payloadStatus(output: unknown): string | undefined {
  const payload = unwrapToolPayload(output);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const status = (payload as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

function landedTools(parts: UIMessage["parts"]): {
  anyWrite: boolean;
  table: boolean;
} {
  let anyWrite = false;
  let table = false;
  for (const part of parts) {
    const name = toolNameFromPart(part);
    if (!name || !WRITE_TOOLS.has(name)) continue;
    const status = payloadStatus(toolOutputFromPart(part));
    if (!status || !LANDED.has(status)) continue;
    anyWrite = true;
    if (TABLE_TOOLS.has(name)) table = true;
  }
  return { anyWrite, table };
}

function isGfmTableRow(trimmed: string): boolean {
  return trimmed.startsWith("|") && trimmed.length > 1;
}

function isGfmTableSeparator(trimmed: string): boolean {
  if (!isGfmTableRow(trimmed)) return false;
  return trimmed
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
    .every((cell) => /^:?-{3,}:?$/.test(cell));
}

function stripMarkdownTables(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const next = lines[i + 1]?.trim();
    if (
      next !== undefined &&
      isGfmTableRow(trimmed) &&
      isGfmTableSeparator(next)
    ) {
      i += 1;
      while (i + 1 < lines.length && isGfmTableRow(lines[i + 1]!.trim())) {
        i += 1;
      }
      continue;
    }
    if (/^Table\s+\d+\.\s+\S/i.test(trimmed)) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitKeepDelims(text: string): string[] {
  const parts = text.split(/((?:[.!?]|…)(?:["')]*)(?:\s+|$))/);
  const sentences: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = parts[i] ?? "";
    const delim = parts[i + 1] ?? "";
    if (body || delim) sentences.push(body + delim);
  }
  return sentences;
}

function dropClaimSentences(text: string, claimRe: RegExp): string {
  return splitKeepDelims(text)
    .filter((sentence) => {
      if (DENIAL_RE.test(sentence)) return true;
      claimRe.lastIndex = 0;
      return !claimRe.test(sentence);
    })
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function appendNote(text: string, note: string): string {
  if (text.includes(note)) return text;
  if (!text.trim()) return note;
  return `${text.replace(/\s+$/, "")}\n\n${note}`;
}

export function rewriteUnlandedWriteParts(
  parts: UIMessage["parts"]
): UIMessage["parts"] {
  const landed = landedTools(parts);
  if (landed.anyWrite && landed.table) return parts;
  let changed = false;
  const next = parts.map((part) => {
    if (part.type !== "text") return part;
    const original = typeof part.text === "string" ? part.text : "";
    let text = original;
    if (!landed.table) {
      const withoutTables = stripMarkdownTables(text);
      const withoutClaims = dropClaimSentences(withoutTables, TABLE_CLAIM_RE);
      if (withoutClaims !== text) {
        text = withoutClaims;
        text = appendNote(text, UNLANDED_TABLE_NOTE);
      }
    }
    if (!landed.anyWrite) {
      const withoutFills = dropClaimSentences(text, FILL_CLAIM_RE);
      if (withoutFills !== text) {
        text = withoutFills;
        text = appendNote(text, UNLANDED_WRITE_NOTE);
      }
    }
    if (text === original) return part;
    changed = true;
    return { ...part, text };
  });
  return changed ? next : parts;
}
