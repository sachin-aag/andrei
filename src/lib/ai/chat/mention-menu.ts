import {
  buildDocumentTree,
  type DocumentTreeFolder,
} from "@/lib/attachments/build-tree";
import type { MentionCandidate } from "@/lib/ai/chat/mention-search";
import type {
  ReportAttachmentFolderRecord,
  ReportAttachmentRecord,
} from "@/types/report";

export const MENTIONS_ATTACHMENTS_GROUP = "attachments";
export const MENTIONS_SECTIONS_GROUP = "sections";
export const MENTIONS_SHEETS_GROUP = "sheets";
export const MENTIONS_PLOTS_GROUP = "plots";

export type MentionMenuGroup = {
  kind: "group";
  id: string;
  /** Path from the root, including this group — used to drill in. */
  path: string[];
  label: string;
  sublabel?: string;
  children: MentionMenuEntry[];
};

export type MentionMenuItem = {
  kind: "item";
  candidate: MentionCandidate;
};

export type MentionMenuEntry = MentionMenuGroup | MentionMenuItem;

export type ChatMentionMenuInput = {
  targetingAnalytics: boolean;
  attachments: readonly ReportAttachmentRecord[];
  folders: readonly ReportAttachmentFolderRecord[];
  sections: readonly MentionCandidate[];
  sheets: readonly MentionCandidate[];
  analyses: readonly MentionCandidate[];
};

function countLeaves(entries: readonly MentionMenuEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.kind === "item") total += 1;
    else total += countLeaves(entry.children);
  }
  return total;
}

function fileCountLabel(count: number): string {
  if (count === 0) return "None ready";
  return `${count} file${count === 1 ? "" : "s"}`;
}

function documentCandidate(
  attachment: ReportAttachmentRecord,
  folderPath: string
): MentionCandidate {
  const description = attachment.description?.trim();
  const pages =
    typeof attachment.pageCount === "number" && attachment.pageCount > 0
      ? `${attachment.pageCount} page${attachment.pageCount === 1 ? "" : "s"}`
      : undefined;
  const extras = [folderPath || undefined, pages].filter(Boolean);
  return {
    type: "document",
    id: attachment.id,
    label: attachment.filename,
    sublabel: description || extras.join(" · ") || undefined,
    keywords: folderPath || undefined,
  };
}

function folderEntries(
  folders: readonly DocumentTreeFolder[],
  attachments: readonly ReportAttachmentRecord[],
  parentPath: string[],
  folderPath: string
): MentionMenuEntry[] {
  const entries: MentionMenuEntry[] = [];

  for (const folder of folders) {
    const childPath = [...parentPath, `folder:${folder.id}`];
    const nextFolderPath = folderPath
      ? `${folderPath} / ${folder.name}`
      : folder.name;
    const children = folderEntries(
      folder.folders,
      folder.attachments,
      childPath,
      nextFolderPath
    );
    if (children.length === 0) continue;
    entries.push({
      kind: "group",
      id: `folder:${folder.id}`,
      path: childPath,
      label: folder.name,
      sublabel: fileCountLabel(countLeaves(children)),
      children,
    });
  }

  for (const attachment of attachments) {
    if (attachment.processingStatus !== "ready") continue;
    entries.push({
      kind: "item",
      candidate: documentCandidate(attachment, folderPath),
    });
  }

  return entries;
}

function itemEntries(candidates: readonly MentionCandidate[]): MentionMenuItem[] {
  return candidates.map((candidate) => ({ kind: "item", candidate }));
}

function sectionCountLabel(count: number): string {
  return `${count} section${count === 1 ? "" : "s"}`;
}

function sheetCountLabel(count: number): string {
  return `${count} sheet${count === 1 ? "" : "s"}`;
}

function plotCountLabel(count: number): string {
  return `${count} plot${count === 1 ? "" : "s"}`;
}

/**
 * Root @ menu: Attachments first (folder tree of ready files), then document
 * sections or data sheets, then plots when any exist.
 */
export function buildChatMentionMenu(
  input: ChatMentionMenuInput
): MentionMenuEntry[] {
  const tree = buildDocumentTree(
    [...input.folders],
    [...input.attachments]
  );
  const attachmentChildren = folderEntries(
    tree.folders,
    tree.attachments,
    [MENTIONS_ATTACHMENTS_GROUP],
    ""
  );
  const attachmentsGroup: MentionMenuGroup = {
    kind: "group",
    id: MENTIONS_ATTACHMENTS_GROUP,
    path: [MENTIONS_ATTACHMENTS_GROUP],
    label: "Attachments",
    sublabel: fileCountLabel(countLeaves(attachmentChildren)),
    children: attachmentChildren,
  };

  const root: MentionMenuEntry[] = [attachmentsGroup];

  if (input.targetingAnalytics) {
    root.push({
      kind: "group",
      id: MENTIONS_SHEETS_GROUP,
      path: [MENTIONS_SHEETS_GROUP],
      label: "Data sheets",
      sublabel: sheetCountLabel(input.sheets.length),
      children: itemEntries(input.sheets),
    });
  } else {
    root.push({
      kind: "group",
      id: MENTIONS_SECTIONS_GROUP,
      path: [MENTIONS_SECTIONS_GROUP],
      label: "Document sections",
      sublabel: sectionCountLabel(input.sections.length),
      children: itemEntries(input.sections),
    });
  }

  if (input.analyses.length > 0) {
    root.push({
      kind: "group",
      id: MENTIONS_PLOTS_GROUP,
      path: [MENTIONS_PLOTS_GROUP],
      label: "Plots",
      sublabel: plotCountLabel(input.analyses.length),
      children: itemEntries(input.analyses),
    });
  }

  return root;
}

export function mentionMenuLeaves(
  entries: readonly MentionMenuEntry[]
): MentionCandidate[] {
  const leaves: MentionCandidate[] = [];
  for (const entry of entries) {
    if (entry.kind === "item") leaves.push(entry.candidate);
    else leaves.push(...mentionMenuLeaves(entry.children));
  }
  return leaves;
}

export function mentionMenuAtPath(
  entries: readonly MentionMenuEntry[],
  path: readonly string[]
): MentionMenuEntry[] {
  let current = [...entries];
  for (const id of path) {
    const next = current.find(
      (entry): entry is MentionMenuGroup =>
        entry.kind === "group" && entry.id === id
    );
    if (!next) return current;
    current = next.children;
  }
  return current;
}

export function mentionMenuGroupLabel(
  entries: readonly MentionMenuEntry[],
  path: readonly string[]
): string | null {
  if (path.length === 0) return null;
  let current = [...entries];
  let label: string | null = null;
  for (const id of path) {
    const next = current.find(
      (entry): entry is MentionMenuGroup =>
        entry.kind === "group" && entry.id === id
    );
    if (!next) return label;
    label = next.label;
    current = next.children;
  }
  return label;
}
