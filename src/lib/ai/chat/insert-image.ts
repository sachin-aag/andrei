import type { UIMessage } from "ai";
import { isChatImageFilePart } from "@/lib/ai/chat/image-parts";
import {
  isGraphAnalysisKind,
  isInsertableGraphAnalysis,
} from "@/lib/statistical-analysis/insertable-graphs";
import type { StatisticalAnalysisSummary } from "@/lib/statistical-analysis/types";
import { isValidSuggestionImageSrc } from "@/lib/suggestions/image-insert";
import type { SuggestionImageInsert } from "@/lib/suggestions/image-insert";

export type ChatImageSource = {
  source: "chat";
  /** 1-based index among images on the latest user message. */
  index: number;
};

export type SectionImageSource = {
  source: "section";
  /**
   * Section to copy FROM. Defaults to the destination section — so a
   * cross-section copy MUST set this (e.g. `purpose` when inserting into
   * `scope`).
   */
  section?: string;
  targetField?: string;
  /** 1-based index among imageInline nodes in that field. */
  index?: number;
  /**
   * Image id from `read_section` (`images[].id` / `id=narrative#1`).
   * Preferred when copying a figure you just read.
   */
  id?: string;
};

export type ResolvedSectionImageLocator = {
  section: string;
  targetField: string;
  index: number;
};

const IMAGE_MARKER_RE = /^\[image:(\d+)\]$/i;
const FIELD_IMAGE_ID_RE = /^(.*)#(\d+)$/;

/**
 * Parse a `read_section` image id (`narrative#1`) or reading marker
 * (`[image:1]`). `[image:N]` has no field — callers keep the default field.
 */
export function parseSectionImageId(
  id: string
): { targetField: string | null; index: number } | null {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const marker = IMAGE_MARKER_RE.exec(trimmed);
  if (marker) {
    const index = Number(marker[1]);
    if (!Number.isInteger(index) || index < 1) return null;
    return { targetField: null, index };
  }
  const hashed = FIELD_IMAGE_ID_RE.exec(trimmed);
  if (!hashed) return null;
  const targetField = hashed[1]!.trim();
  const index = Number(hashed[2]);
  if (!targetField || !Number.isInteger(index) || index < 1) return null;
  return { targetField, index };
}

/**
 * Resolve where to copy an inline figure from. `section` / `targetField` on
 * the tool are the DESTINATION; source defaults to that destination unless
 * `image.section` / `image.id` override it.
 */
export function resolveSectionImageLocator(input: {
  destSection: string;
  destField: string;
  sourceSection?: string;
  sourceField?: string;
  index?: number;
  id?: string;
}):
  | { ok: true; locator: ResolvedSectionImageLocator }
  | { ok: false; message: string } {
  let sourceField = input.sourceField?.trim() || input.destField;
  let index = input.index;
  const sourceSection = input.sourceSection?.trim() || input.destSection;

  if (input.id?.trim()) {
    const parsed = parseSectionImageId(input.id);
    if (!parsed) {
      return {
        ok: false,
        message: `Invalid image.id '${input.id.trim()}'. Use the id from read_section (e.g. 'narrative#1') or [image:N].`,
      };
    }
    if (parsed.targetField) sourceField = parsed.targetField;
    index = index ?? parsed.index;
  }

  if (index == null) {
    return {
      ok: false,
      message:
        "Provide image.id from read_section (e.g. 'narrative#1') or image.index (1-based). When copying into a different section, also set image.section to the section the figure is in now.",
    };
  }

  return {
    ok: true,
    locator: { section: sourceSection, targetField: sourceField, index },
  };
}

export function sectionImageNotFoundMessage(opts: {
  destSection: string;
  sourceSection: string;
  sourceField: string;
  index: number;
  listedCount: number;
  sourceSectionOmitted: boolean;
}): string {
  if (opts.listedCount === 0) {
    if (opts.sourceSectionOmitted && opts.sourceSection === opts.destSection) {
      return `No images in ${opts.sourceSection} ${opts.sourceField}. image.section defaults to the destination ('${opts.destSection}'). To copy a figure from another section, set image.section to that section (e.g. 'purpose') and pass image.id from read_section (e.g. 'narrative#1').`;
    }
    return `No images in ${opts.sourceSection} ${opts.sourceField}.`;
  }
  return `No image at index ${opts.index}. ${opts.sourceSection} ${opts.sourceField} has ${opts.listedCount} image${opts.listedCount === 1 ? "" : "s"} (index 1–${opts.listedCount}).`;
}

export type AnalyticsImageSource = {
  source: "analytics";
  /** Saved Analytics plot id (context map / @ mention). */
  analysisId: string;
};

export type InsertImageSource =
  | ChatImageSource
  | SectionImageSource
  | AnalyticsImageSource;

export function resolveAnalyticsImage(
  analysis: StatisticalAnalysisSummary | undefined,
  analysisId: string
):
  | { ok: true; image: SuggestionImageInsert }
  | { ok: false; message: string } {
  const id = analysisId.trim();
  if (!id) {
    return {
      ok: false,
      message:
        "Provide image.analysisId from the context map Analytics plots list (or a tagged @ plot).",
    };
  }
  if (!analysis) {
    return {
      ok: false,
      message: `No Analytics plot with id '${id}'. Use analysisId from the context map Analytics plots list, or tag the plot with @.`,
    };
  }
  if (!isGraphAnalysisKind(analysis.kind)) {
    return {
      ok: false,
      message: `'${analysis.title}' (${analysis.kind}) is not a figure you can insert. insert_image source=analytics copies a sixpack, measurement scatter, or XY scatter.`,
    };
  }
  if (!isInsertableGraphAnalysis(analysis) || !analysis.previewImage) {
    return {
      ok: false,
      message: `'${analysis.title}' has no captured preview yet. Open it in Analytics so the preview can be saved, then retry insert_image with source=analytics.`,
    };
  }
  const preview = analysis.previewImage;
  if (!isValidSuggestionImageSrc(preview.dataUrl)) {
    return {
      ok: false,
      message: `The stored preview for '${analysis.title}' is not a usable image. Open the plot in Analytics and retry.`,
    };
  }
  return {
    ok: true,
    image: {
      src: preview.dataUrl,
      alt: preview.alt || analysis.title,
      width: preview.widthPx,
      mediaId: null,
      chartSpec: preview.chartSpec,
    },
  };
}

export type ListedChatImage = {
  index: number;
  mediaType: string;
  alt: string;
};

export function listLatestUserChatImages(
  messages: UIMessage[]
): Array<{ index: number; src: string; alt: string; mediaType: string }> {
  let latest: UIMessage | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      latest = messages[i]!;
      break;
    }
  }
  if (!latest?.parts) return [];
  const listed: Array<{
    index: number;
    src: string;
    alt: string;
    mediaType: string;
  }> = [];
  for (const part of latest.parts) {
    if (!isChatImageFilePart(part)) continue;
    if (!isValidSuggestionImageSrc(part.url)) continue;
    listed.push({
      index: listed.length + 1,
      src: part.url,
      alt: typeof part.filename === "string" ? stripExtension(part.filename) : "",
      mediaType: part.mediaType,
    });
  }
  return listed;
}

export function resolveChatImage(
  messages: UIMessage[],
  index: number
):
  | { ok: true; image: SuggestionImageInsert }
  | { ok: false; message: string; available: ListedChatImage[] } {
  const listed = listLatestUserChatImages(messages);
  const available = listed.map(({ index: i, mediaType, alt }) => ({
    index: i,
    mediaType,
    alt,
  }));
  const hit = listed.find((img) => img.index === index);
  if (!hit) {
    return {
      ok: false,
      message:
        listed.length === 0
          ? "The latest user message has no attached images. Ask the engineer to attach a photo in chat, or copy a figure already in the section with source=section."
          : `No chat image at index ${index}. Latest user message has ${listed.length} image${listed.length === 1 ? "" : "s"} (index 1–${listed.length}).`,
      available,
    };
  }
  return {
    ok: true,
    image: { src: hit.src, alt: hit.alt || null, width: null, mediaId: null },
  };
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim();
}
