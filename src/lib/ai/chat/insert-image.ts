import type { UIMessage } from "ai";
import { isChatImageFilePart } from "@/lib/ai/chat/image-parts";
import {
  isGraphAnalysisKind,
  isInsertableGraphAnalysis,
  listGraphAnalyses,
  listInsertableGraphAnalyses,
} from "@/lib/statistical-analysis/insertable-graphs";
import { SECTION_LABELS } from "@/types/sections";
import {
  BOXPLOT,
  CAPABILITY_SIXPACK_NORMAL,
  MEASUREMENT_SCATTER,
  ONE_WAY_ANOVA,
  XY_SCATTER,
  isBoxplotAnalysis,
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  type AnalysisKind,
  type StatisticalAnalysisSummary,
} from "@/lib/statistical-analysis/types";
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

const PLOT_NAME_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "my",
  "our",
  "your",
  "and",
  "or",
  "of",
  "for",
  "to",
  "into",
  "onto",
  "in",
  "on",
  "at",
  "from",
  "with",
  "please",
  "can",
  "could",
  "would",
  "should",
  "insert",
  "add",
  "copy",
  "put",
  "place",
  "include",
  "embed",
  "use",
  "plot",
  "plots",
  "chart",
  "charts",
  "graph",
  "graphs",
  "figure",
  "figures",
  "image",
  "images",
  "photo",
  "picture",
  "section",
  "sections",
  "field",
  "document",
  "report",
  "analytics",
  "results",
  "available",
  "existing",
  "saved",
  "current",
  "purpose",
  "scope",
  "define",
  "measure",
  "analyze",
  "analyse",
  "improve",
  "control",
  "conclusion",
  "references",
  "traceability",
  "appendices",
  "narrative",
  "body",
  "approval",
  "signoff",
  "one",
  "ones",
  "also",
  "just",
  "here",
  "there",
  "yes",
  "yeah",
  "yep",
  "yup",
  "ok",
  "okay",
  "sure",
  "thanks",
  "thank",
  "no",
  "not",
  "dont",
  "didnt",
  "doesnt",
  "isnt",
  "wasnt",
  "wont",
  "cant",
  "cannot",
  "still",
  "see",
  "saw",
  "look",
  "looking",
  "find",
  "found",
  "show",
  "showing",
  "shown",
  "visible",
  "missing",
  "appear",
  "appears",
  "where",
  "why",
  "how",
  "what",
  "which",
  "did",
  "does",
  "was",
  "were",
  "been",
  "have",
  "has",
  "had",
  "try",
  "trying",
  "tried",
  "again",
  "really",
  "actually",
  "maybe",
  "perhaps",
  "hello",
  "hey",
  "wait",
  "hmm",
  "nope",
  "nah",
  "both",
  "them",
  "method",
  "methods",
  "measurement",
  "measurements",
  "protocol",
  "protocols",
  "test",
  "tests",
  "testing",
]);

function rawPlotNameTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []).filter(
    (token) => token.length >= 2
  );
}

const PLOT_NAME_STOPWORDS_ALL: ReadonlySet<string> = (() => {
  const words = new Set(PLOT_NAME_STOPWORDS);
  for (const label of Object.values(SECTION_LABELS)) {
    for (const token of rawPlotNameTokens(label)) words.add(token);
  }
  return words;
})();

const ANALYTICS_CREATE_COPY =
  "They can create additional plots in Analytics (Document | Analytics at the top of the report).";
const RELAY_AVAILABLE_PLOTS_COPY =
  "Reply in prose with those titles once. Do not call insert_image again this turn. Do not insert a different plot. Do not call plot_measurements as a substitute.";

function graphKindLabel(kind: AnalysisKind): string {
  switch (kind) {
    case CAPABILITY_SIXPACK_NORMAL:
      return "sixpack";
    case MEASUREMENT_SCATTER:
      return "measurement scatter";
    case XY_SCATTER:
      return "XY scatter";
    case BOXPLOT:
      return "boxplot";
    case ONE_WAY_ANOVA:
      return "ANOVA";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function tokenizePlotName(text: string): string[] {
  return rawPlotNameTokens(text).filter(
    (token) => !PLOT_NAME_STOPWORDS_ALL.has(token)
  );
}

function tokenMatchesIdentity(request: string, identity: string): boolean {
  if (request === identity) return true;
  if (request.length < 4) return false;
  return identity.includes(request) || request.includes(identity);
}

function analysisIdentityTokens(
  analysis: StatisticalAnalysisSummary
): string[] {
  const parts: string[] = [analysis.title];
  if (analysis.previewImage?.alt) parts.push(analysis.previewImage.alt);
  if (isSixpackAnalysis(analysis)) {
    parts.push(
      analysis.config.columnName,
      analysis.config.title,
      "sixpack",
      "capability"
    );
  } else if (isScatterAnalysis(analysis)) {
    parts.push(
      analysis.config.query,
      analysis.config.yLabel,
      analysis.config.xLabel,
      analysis.config.title,
      "scatter"
    );
  } else if (isXyScatterAnalysis(analysis)) {
    parts.push(
      analysis.config.xColumnName,
      analysis.config.yColumnName,
      analysis.config.title,
      "scatter",
      "xy"
    );
  } else if (isBoxplotAnalysis(analysis)) {
    parts.push(
      analysis.config.yColumnName,
      ...analysis.config.categoryColumnNames,
      analysis.config.title,
      "boxplot",
      "box"
    );
  }
  return [...new Set(tokenizePlotName(parts.join(" ")))];
}

export function plotMatchesNamedTokens(
  analysis: StatisticalAnalysisSummary,
  namedTokens: readonly string[]
): boolean {
  if (namedTokens.length === 0) return false;
  const identity = analysisIdentityTokens(analysis);
  return namedTokens.every((token) =>
    identity.some((id) => tokenMatchesIdentity(token, id))
  );
}

function formatAvailablePlots(analyses: StatisticalAnalysisSummary[]): string {
  const graphs = listGraphAnalyses(analyses);
  if (graphs.length === 0) return "none";
  return graphs
    .map((analysis) => {
      const title = analysis.title.trim() || "untitled plot";
      const preview = isInsertableGraphAnalysis(analysis)
        ? ""
        : " — no preview yet";
      return `"${title}" (${graphKindLabel(analysis.kind)}) [${analysis.id}]${preview}`;
    })
    .join("; ");
}

function availablePlotsMessage(opts: {
  analyses: StatisticalAnalysisSummary[];
  requested?: string;
  unspecified?: boolean;
}): string {
  const listed = formatAvailablePlots(opts.analyses);
  if (listed === "none") {
    return `There are no saved Analytics plots to insert. Tell the engineer they can create plots in Analytics (Document | Analytics at the top of the report), then insert them here. Do not invent a figure.`;
  }
  if (opts.unspecified) {
    return `The engineer did not name which plot. Available plots: ${listed}. Tell them those are available. ${ANALYTICS_CREATE_COPY} Ask which to insert. ${RELAY_AVAILABLE_PLOTS_COPY}`;
  }
  const requested = opts.requested?.trim() || "that name";
  return `No Analytics plot matches "${requested}". Available plots: ${listed}. Tell the engineer those titles are available. ${ANALYTICS_CREATE_COPY} ${RELAY_AVAILABLE_PLOTS_COPY}`;
}

function userMessageText(message: UIMessage): string {
  const texts: string[] = [];
  for (const part of message.parts ?? []) {
    if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
      texts.push(part.text);
    }
  }
  return texts.join("\n");
}

/** Most recent user turn only — confirmation ("yes, that one") must not inherit an earlier named miss. */
export function latestUserMessageText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    return userMessageText(message);
  }
  return "";
}

/** Latest user turns, oldest-first among the slice, for plot-name matching. */
export function recentUserMessageText(
  messages: UIMessage[],
  maxTurns = 3
): string {
  const chunks: string[] = [];
  let seen = 0;
  for (let i = messages.length - 1; i >= 0 && seen < maxTurns; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    seen += 1;
    const text = userMessageText(message);
    if (text) chunks.push(text);
  }
  return chunks.reverse().join("\n");
}

export type NamedAnalyticsPlotResolution =
  | { ok: true; analysisId: string }
  | { ok: false; message: string };

/**
 * Match the engineer's named plot against saved Analytics figures. A named
 * miss lists what is available instead of inserting a different plot.
 * Destination-section wording and confirmation ("yes, that one") are not
 * plot names — those follow analysisId or the only saved figure.
 */
export function resolveNamedAnalyticsPlot(input: {
  analysisId: string;
  analyses: StatisticalAnalysisSummary[];
  userText: string;
}): NamedAnalyticsPlotResolution {
  const requestedId = input.analysisId.trim();
  const namedTokens = tokenizePlotName(input.userText);
  const graphs = listGraphAnalyses(input.analyses);
  const insertable = listInsertableGraphAnalyses(input.analyses);

  const pickUnnamed = (): NamedAnalyticsPlotResolution => {
    if (requestedId) {
      const requested = graphs.find((analysis) => analysis.id === requestedId);
      if (requested) {
        return { ok: true, analysisId: requested.id };
      }
    }
    if (insertable.length === 1) {
      return { ok: true, analysisId: insertable[0]!.id };
    }
    if (graphs.length === 1) {
      return { ok: true, analysisId: graphs[0]!.id };
    }
    return {
      ok: false,
      message: availablePlotsMessage({
        analyses: input.analyses,
        unspecified: insertable.length > 1 || graphs.length > 1,
      }),
    };
  };

  if (namedTokens.length === 0) {
    return pickUnnamed();
  }

  const matches = graphs.filter((analysis) =>
    plotMatchesNamedTokens(analysis, namedTokens)
  );
  if (matches.length === 0) {
    return {
      ok: false,
      message: availablePlotsMessage({
        analyses: input.analyses,
        requested: namedTokens.join(" "),
      }),
    };
  }
  if (matches.length === 1) {
    return { ok: true, analysisId: matches[0]!.id };
  }
  const selected = matches.find((analysis) => analysis.id === requestedId);
  if (selected) {
    return { ok: true, analysisId: selected.id };
  }
  return {
    ok: false,
    message: availablePlotsMessage({
      analyses: matches,
      unspecified: true,
    }),
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
