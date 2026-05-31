import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";
import type {
  ImportedReportComment,
  ImportedSections,
} from "@/lib/import/docx-import-types";
import { extractWordCommentsFromDocxBuffer } from "@/lib/import/docx-comments";
import {
  cleanImportedText,
  normalizedSearchIndex,
} from "@/lib/import/docx-import-text";

type CommentTarget =
  | {
      section: SectionType;
      contentPath: string;
      kind: "rich";
      doc: JSONContent;
    }
  | {
      section: SectionType;
      contentPath: string;
      kind: "plain";
      text: string;
    };

function buildCommentTargets(sections: ImportedSections): CommentTarget[] {
  return [
    { section: "define", contentPath: "narrative", kind: "rich", doc: sections.define.narrative },
    { section: "measure", contentPath: "narrative", kind: "rich", doc: sections.measure.narrative },
    { section: "analyze", contentPath: "sixM.man", kind: "plain", text: sections.analyze.sixM.man },
    { section: "analyze", contentPath: "sixM.machine", kind: "plain", text: sections.analyze.sixM.machine },
    { section: "analyze", contentPath: "sixM.measurement", kind: "plain", text: sections.analyze.sixM.measurement },
    { section: "analyze", contentPath: "sixM.material", kind: "plain", text: sections.analyze.sixM.material },
    { section: "analyze", contentPath: "sixM.method", kind: "plain", text: sections.analyze.sixM.method },
    { section: "analyze", contentPath: "sixM.milieu", kind: "plain", text: sections.analyze.sixM.milieu },
    { section: "analyze", contentPath: "sixM.conclusion", kind: "plain", text: sections.analyze.sixM.conclusion },
    { section: "analyze", contentPath: "fiveWhy.narrative", kind: "plain", text: sections.analyze.fiveWhy.narrative },
    { section: "analyze", contentPath: "brainstorming", kind: "plain", text: sections.analyze.brainstorming },
    { section: "analyze", contentPath: "otherTools", kind: "plain", text: sections.analyze.otherTools },
    { section: "analyze", contentPath: "investigationOutcome", kind: "rich", doc: sections.analyze.investigationOutcome },
    { section: "analyze", contentPath: "rootCause.narrative", kind: "rich", doc: sections.analyze.rootCause.narrative },
    {
      section: "analyze",
      contentPath: "impactAssessment",
      kind: "plain",
      text: sections.analyze.impactAssessment,
    },
    { section: "improve", contentPath: "correctiveActions", kind: "plain", text: sections.improve.correctiveActions },
    { section: "control", contentPath: "preventiveActions", kind: "plain", text: sections.control.preventiveActions },
  ];
}

function nodeSize(node: JSONContent): number {
  if (node.type === "text") return (node.text ?? "").length;
  if (!node.content?.length) return 1;
  return 2 + node.content.reduce((sum, child) => sum + nodeSize(child), 0);
}

function buildPlainTextPositionMap(doc: JSONContent): {
  text: string;
  positions: number[];
} {
  const chunks: string[] = [];
  const positions: number[] = [];

  function appendText(text: string, startPos: number) {
    chunks.push(text);
    for (let i = 0; i < text.length; i++) positions.push(startPos + i);
  }

  function appendBreak() {
    chunks.push("\n");
    positions.push(-1);
  }

  function walk(node: JSONContent, pos: number): number {
    if (node.type === "text") {
      const text = node.text ?? "";
      appendText(text, pos);
      return text.length;
    }

    const children = node.content ?? [];
    let childPos = pos + 1;
    for (const child of children) {
      const size = walk(child, childPos);
      childPos += size;
    }

    if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") {
      appendBreak();
    }

    return nodeSize(node);
  }

  walk(doc, 0);
  return { text: chunks.join(""), positions };
}

function findRichAnchorRange(doc: JSONContent, anchorText: string): {
  fromPos: number;
  toPos: number;
} | null {
  const needle = cleanImportedText(anchorText);
  if (!needle) return null;
  const { text, positions } = buildPlainTextPositionMap(doc);
  const index = normalizedSearchIndex(text, needle);
  if (index === -1) return null;

  const endIndex = Math.min(text.length, index + needle.length);
  let fromPos: number | null = null;
  for (let i = index; i < positions.length; i++) {
    if ((positions[i] ?? -1) >= 0) {
      fromPos = positions[i]!;
      break;
    }
  }
  let toPos: number | null = null;
  for (let i = Math.max(index, endIndex - 1); i >= 0; i--) {
    if ((positions[i] ?? -1) >= 0) {
      toPos = positions[i]! + 1;
      break;
    }
  }
  if (fromPos == null || toPos == null || toPos <= fromPos) return null;
  return { fromPos, toPos };
}

export function mapImportedWordComments(
  buffer: Buffer,
  sections: ImportedSections
): ImportedReportComment[] {
  const targets = buildCommentTargets(sections);
  return extractWordCommentsFromDocxBuffer(buffer).map((comment) => {
    const anchorText = cleanImportedText(comment.anchorText);
    for (const target of targets) {
      if (comment.section && target.section !== comment.section) continue;
      if (target.kind === "rich") {
        const range = findRichAnchorRange(target.doc, anchorText);
        if (range) {
          return {
            parentExternalCommentId: comment.parentExternalCommentId,
            externalCommentId: comment.externalCommentId,
            externalAuthorName: comment.authorName,
            externalAuthorInitials: comment.authorInitials,
            externalCreatedAt: comment.createdAt,
            content: comment.content,
            anchorText,
            section: target.section,
            contentPath: target.contentPath,
            fromPos: range.fromPos,
            toPos: range.toPos,
          };
        }
      } else if (anchorText && normalizedSearchIndex(target.text, anchorText) !== -1) {
        return {
          parentExternalCommentId: comment.parentExternalCommentId,
          externalCommentId: comment.externalCommentId,
          externalAuthorName: comment.authorName,
          externalAuthorInitials: comment.authorInitials,
          externalCreatedAt: comment.createdAt,
          content: comment.content,
          anchorText,
          section: target.section,
          contentPath: target.contentPath,
          fromPos: null,
          toPos: null,
        };
      }
    }

    const fallbackSection = comment.section ?? "define";
    return {
      parentExternalCommentId: comment.parentExternalCommentId,
      externalCommentId: comment.externalCommentId,
      externalAuthorName: comment.authorName,
      externalAuthorInitials: comment.authorInitials,
      externalCreatedAt: comment.createdAt,
      content: comment.content,
      anchorText,
      section: fallbackSection,
      contentPath: null,
      fromPos: null,
      toPos: null,
    };
  });
}
