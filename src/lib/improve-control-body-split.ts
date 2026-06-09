/**
 * Splits unified Improve/Control content (as stored in the app) into template cells:
 * checkpoints in the Improve/Control row, narrative in the Corrective/Preventive Action row.
 */

import type { JSONContent } from "@tiptap/core";
import {
  emptyDoc,
  richJsonToPlainText,
} from "@/lib/tiptap/rich-text";
import {
  CONTROL_LAST_CHECKPOINT_MARKER,
  IMPROVE_LAST_CHECKPOINT_MARKER,
} from "@/lib/report-section-guidance";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelPattern(label: string): string {
  return `${escapeRegex(label)}(?![A-Za-z0-9_])(?:[ \\t]*\\([^)]*\\))?[ \\t]*:?[ \\t]*`;
}

function trimPlain(text: string): string {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findLabel(text: string, labels: string[], from = 0): RegExpExecArray | null {
  const alt = labels.map(labelPattern).join("|");
  const re = new RegExp(`^[ \\t]*(?:${alt})`, "gim");
  re.lastIndex = from;
  return re.exec(text);
}

function getBetweenLabels(
  text: string,
  startLabels: string[],
  stopLabels: string[]
): string {
  const start = findLabel(text, startLabels);
  if (!start) return "";

  const startIndex = start.index + start[0].length;
  let endIndex = text.length;
  for (const stop of stopLabels) {
    const match = findLabel(text, [stop], startIndex);
    if (match && match.index < endIndex) endIndex = match.index;
  }

  return trimPlain(text.slice(startIndex, endIndex));
}

function hasLabel(text: string, labels: string[]): boolean {
  return findLabel(text, labels) !== null;
}

/** Line-anchored — avoids splitting on label phrases inside checklist questions. */
function textBeforeAnyLabel(text: string, labels: string[]): string {
  let endIndex = text.length;
  for (const label of labels) {
    const match = findLabel(text, [label]);
    if (match && match.index < endIndex) endIndex = match.index;
  }
  return trimPlain(text.slice(0, endIndex));
}

export const IMPROVE_ACTION_LABELS = [
  "Corrective Action",
  "Corrective Actions Register",
] as const;

export const CONTROL_ACTION_LABELS = ["Preventive Action"] as const;

export const CONTROL_BODY_STOP_LABELS = [
  "Documents Reviewed",
  "Document Reviewed",
  "List of attachment",
  "List of attachments",
] as const;

function splitAfterLastTemplateCheckpoint(
  body: string,
  lastCheckpointMarker: string
): { checkpoints: string; correctiveAction: string } | null {
  const re = new RegExp(escapeRegex(lastCheckpointMarker).replace(/\?/g, "\\?"), "i");
  const match = re.exec(body);
  if (!match) return null;

  let splitAt = match.index + match[0].length;
  const newline = body.indexOf("\n", splitAt);
  splitAt = newline === -1 ? body.length : newline;

  const narrative = trimPlain(body.slice(splitAt));
  if (!narrative) return null;

  return {
    checkpoints: trimPlain(body.slice(0, splitAt)),
    correctiveAction: narrative,
  };
}

function parseCorrectiveActionsRegister(text: string): string {
  const register = getBetweenLabels(text, ["Corrective Actions Register"], []);
  if (!register) return "";

  const starts = Array.from(register.matchAll(/^CA-\d+\s*:\s*/gim));
  if (starts.length === 0) return trimPlain(register);

  const entries: string[] = [];
  for (let idx = 0; idx < starts.length; idx++) {
    const match = starts[idx]!;
    const next = starts[idx + 1];
    const start = match.index + match[0].length;
    const end = next?.index ?? register.length;
    entries.push(trimPlain(register.slice(start, end)));
  }

  return trimPlain(entries.filter(Boolean).join("\n\n"));
}

export function splitImproveUnifiedText(text: string): {
  checkpoints: string;
  correctiveAction: string;
} {
  const body = trimPlain(text);
  if (!body) return { checkpoints: "", correctiveAction: "" };

  if (!hasLabel(body, [...IMPROVE_ACTION_LABELS])) {
    const fallback = splitAfterLastTemplateCheckpoint(
      body,
      IMPROVE_LAST_CHECKPOINT_MARKER
    );
    if (fallback) return fallback;
    return { checkpoints: body, correctiveAction: "" };
  }

  const checkpoints = textBeforeAnyLabel(body, [...IMPROVE_ACTION_LABELS]);

  const correctiveActionBlock = getBetweenLabels(
    body,
    ["Corrective Action"],
    ["Corrective Actions Register"]
  );
  const register = parseCorrectiveActionsRegister(body);
  const correctiveAction = [correctiveActionBlock, register]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");

  return {
    checkpoints: checkpoints.trim(),
    correctiveAction,
  };
}

function nodePlainText(node: JSONContent): string {
  return richJsonToPlainText({ type: "doc", content: [node] }).trim();
}

function paragraphStartsWithLabel(node: JSONContent, labels: readonly string[]): boolean {
  const plain = nodePlainText(node);
  if (!plain) return false;
  return findLabel(plain, [...labels]) !== null;
}

function splitRichDocAtLabels(
  doc: JSONContent,
  actionLabels: readonly string[],
  stopLabels: readonly string[]
): { checkpoints: JSONContent[]; action: JSONContent[] } {
  const nodes = doc.content ?? [];
  const checkpoints: JSONContent[] = [];
  const action: JSONContent[] = [];
  let phase: "checkpoints" | "action" = "checkpoints";

  for (const node of nodes) {
    if (phase === "checkpoints" && paragraphStartsWithLabel(node, actionLabels)) {
      phase = "action";
      continue;
    }
    if (phase === "action" && paragraphStartsWithLabel(node, stopLabels)) {
      break;
    }
    if (phase === "checkpoints") checkpoints.push(node);
    else action.push(node);
  }

  return { checkpoints, action };
}

export function splitImproveUnifiedRichDoc(doc: JSONContent): {
  checkpoints: string;
  correctiveActionDoc: JSONContent;
} {
  const plain = richJsonToPlainText(doc);
  const textSplit = splitImproveUnifiedText(plain);
  if (!textSplit.correctiveAction) {
    return { checkpoints: textSplit.checkpoints, correctiveActionDoc: emptyDoc() };
  }

  const { checkpoints: checkpointNodes, action: actionNodes } = splitRichDocAtLabels(
    doc,
    IMPROVE_ACTION_LABELS,
    ["Corrective Actions Register"]
  );

  const checkpoints =
    checkpointNodes.length > 0
      ? richJsonToPlainText({ type: "doc", content: checkpointNodes })
      : textSplit.checkpoints;

  const correctiveActionDoc =
    actionNodes.length > 0
      ? { type: "doc", content: actionNodes }
      : doc;

  return {
    checkpoints: checkpoints.trim(),
    correctiveActionDoc,
  };
}

export function splitControlUnifiedRichDoc(doc: JSONContent): {
  checkpoints: string;
  preventiveActionDoc: JSONContent;
} {
  const plain = richJsonToPlainText(doc);
  const textSplit = splitControlUnifiedText(plain);
  if (!textSplit.preventiveAction) {
    return { checkpoints: textSplit.checkpoints, preventiveActionDoc: emptyDoc() };
  }

  const { checkpoints: checkpointNodes, action: actionNodes } = splitRichDocAtLabels(
    doc,
    CONTROL_ACTION_LABELS,
    CONTROL_BODY_STOP_LABELS
  );

  const checkpoints =
    checkpointNodes.length > 0
      ? richJsonToPlainText({ type: "doc", content: checkpointNodes })
      : textSplit.checkpoints;

  const preventiveActionDoc =
    actionNodes.length > 0
      ? { type: "doc", content: actionNodes }
      : doc;

  return {
    checkpoints: checkpoints.trim(),
    preventiveActionDoc,
  };
}

export function splitControlUnifiedText(text: string): {
  checkpoints: string;
  preventiveAction: string;
} {
  const body = trimPlain(text);
  if (!body) return { checkpoints: "", preventiveAction: "" };

  if (!hasLabel(body, [...CONTROL_ACTION_LABELS])) {
    const fallback = splitAfterLastTemplateCheckpoint(
      body,
      CONTROL_LAST_CHECKPOINT_MARKER
    );
    if (fallback) {
      return {
        checkpoints: fallback.checkpoints,
        preventiveAction: fallback.correctiveAction,
      };
    }
    return { checkpoints: body, preventiveAction: "" };
  }

  const checkpoints = textBeforeAnyLabel(body, [...CONTROL_ACTION_LABELS]);

  const preventiveAction = getBetweenLabels(
    body,
    [...CONTROL_ACTION_LABELS],
    [...CONTROL_BODY_STOP_LABELS]
  );

  return {
    checkpoints: checkpoints.trim(),
    preventiveAction: preventiveAction.trim(),
  };
}
