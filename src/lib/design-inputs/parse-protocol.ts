import type { ProtocolParserConfig } from "./types";
import type {
  NonNormativeHits,
  TestMethodBlock,
  TildeHit,
} from "./types";
import {
  extractRequirementIds,
  isFullRequirementId,
  isIdContinuation,
  isIdPrefix,
  pageAt,
  repairWrappedIds,
  slugify,
  uniqueIds,
  duplicateIds,
} from "./ids";

export type ParsedProtocol = {
  blocks: TestMethodBlock[];
  equipmentTable: string[];
  referencesTable: string[];
};

const PAGE_NOISE =
  /Page \d+ of|COMPANY PROPRIETARY|Verification Test Protocol Template|Solea Model 3 Software Design Verification Protocol|^\s*790-00134/i;

export function parseProtocol(
  protocolText: string,
  config: ProtocolParserConfig
): ParsedProtocol {
  const frontMatterEnd = protocolText.search(config.protocol.requirementsMarker);
  const frontMatter =
    frontMatterEnd >= 0 ? protocolText.slice(0, frontMatterEnd) : protocolText;

  return {
    blocks: parseBlocks(protocolText, config),
    equipmentTable: parseEquipmentTable(frontMatter),
    referencesTable: parseReferencesTable(
      frontMatter,
      config.protocol.documentNoPattern
    ),
  };
}

function parseBlocks(
  protocolText: string,
  config: ProtocolParserConfig
): TestMethodBlock[] {
  const reqRe = new RegExp(config.protocol.requirementsMarker.source, "gm");
  const methodRe = new RegExp(
    config.protocol.testingMethodsMarker.source,
    "gm"
  );
  const blocks: TestMethodBlock[] = [];
  const reqStarts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = reqRe.exec(protocolText)) !== null) {
    reqStarts.push(m.index);
  }

  for (let i = 0; i < reqStarts.length; i++) {
    const reqIndex = reqStarts[i];
    const nextReq = reqStarts[i + 1] ?? protocolText.length;
    methodRe.lastIndex = reqIndex;
    const methodMatch = methodRe.exec(protocolText);
    if (!methodMatch || methodMatch.index >= nextReq) continue;

    const methodsStart = methodMatch.index;
    const afterMethods = protocolText.slice(methodsStart, nextReq);
    const endMatch = afterMethods.match(config.protocol.sectionEndMarker);
    if (!endMatch || endMatch.index === undefined) continue;

    const methodsEnd = methodsStart + endMatch.index;
    const reqSection = protocolText.slice(
      reqIndex + "REQUIREMENTS".length,
      methodsStart
    );
    const methodsSection = protocolText.slice(
      methodsStart + "TESTING METHODS".length,
      methodsEnd
    );

    const title = titleBefore(protocolText, reqIndex);
    const { declaredReqIds, bannerReqIds, bannerDuplicateIds, tombstoneReqIds } =
      splitDeclaredAndBanner(reqSection, config);
    const testedReqIds = parseTestedReqIds(
      methodsSection,
      config,
      new Set(tombstoneReqIds)
    );
    const startPage = pageAt(protocolText, reqIndex);
    const endPage = pageAt(protocolText, methodsEnd);

    blocks.push({
      id: uniqueBlockId(slugify(title) || `block-${i + 1}`, blocks),
      title,
      pages: { start: startPage, end: endPage },
      declaredReqIds,
      bannerReqIds,
      bannerDuplicateIds,
      testedReqIds,
      tildeHits: tildeHits(methodsSection, protocolText, methodsStart, config),
      nonNormativeHits: countNonNormative(methodsSection, config),
      instrumentsNamed: instrumentsNamed(methodsSection, config),
    });
  }

  return blocks;
}

function uniqueBlockId(base: string, existing: TestMethodBlock[]): string {
  if (!existing.some((b) => b.id === base)) return base;
  let n = 2;
  while (existing.some((b) => b.id === `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function titleBefore(text: string, reqIndex: number): string {
  const before = text.slice(Math.max(0, reqIndex - 800), reqIndex);
  const lines = before.split(/\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    if (PAGE_NOISE.test(line)) continue;
    if (/^Rev\./i.test(line)) continue;
    return line;
  }
  return "untitled";
}

function splitDeclaredAndBanner(
  reqSection: string,
  config: ProtocolParserConfig
): {
  declaredReqIds: string[];
  bannerReqIds: string[];
  bannerDuplicateIds: string[];
  tombstoneReqIds: string[];
} {
  const lines = reqSection.split(/\n/);
  let bannerStart = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    if (isBannerLine(line, config)) {
      bannerStart = i;
      continue;
    }
    break;
  }
  const declaredText = lines.slice(0, bannerStart).join("\n");
  const bannerText = repairWrappedIds(lines.slice(bannerStart).join("\n"));
  const classified = classifyDeclaredIds(declaredText, config);
  const tombstoneSet = new Set(classified.tombstones);
  const declaredCited = seeAlsoIds(declaredText, config).filter(
    (id) => !tombstoneSet.has(id)
  );
  const bannerRaw = extractRequirementIds(bannerText, config.requirementId);
  return {
    declaredReqIds: uniqueIds([...classified.live, ...declaredCited]),
    bannerReqIds: uniqueIds(bannerRaw),
    bannerDuplicateIds: duplicateIds(bannerRaw),
    tombstoneReqIds: uniqueIds(classified.tombstones),
  };
}

function isBannerLine(line: string, config: ProtocolParserConfig): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/Req ID/i.test(trimmed)) return false;
  const withoutIds = trimmed
    .replace(withGlobalLocal(config.requirementId), "")
    .replace(/SW-/g, "")
    .replace(/[A-Z]{2,}-\d+(?:\.\d+)*/g, "")
    .replace(/[,.\s]/g, "");
  return withoutIds.replace(/\d+/g, "").length === 0;
}

function withGlobalLocal(pattern: RegExp): RegExp {
  return new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  );
}

function classifyDeclaredIds(
  text: string,
  config: ProtocolParserConfig
): { live: string[]; tombstones: string[] } {
  const live: string[] = [];
  const tombstones: string[] = [];
  for (const line of text.split(/\n/)) {
    const match = line.match(config.requirementIdLine);
    if (!match) continue;
    const id = match[2];
    const rest = match[3] ?? "";
    if (isRemovedMarker(rest, config)) tombstones.push(id);
    else live.push(id);
  }
  return { live, tombstones };
}

function isRemovedMarker(
  text: string,
  config: ProtocolParserConfig
): boolean {
  config.removed.lastIndex = 0;
  return config.removed.test(text);
}

function seeAlsoIds(
  text: string,
  config: ProtocolParserConfig
): string[] {
  const re = new RegExp(
    `(?:See\\s+|\\[)(${config.requirementId.source})`,
    "gi"
  );
  return [...text.matchAll(re)].map((m) => m[1]);
}

function parseTestedReqIds(
  methodsText: string,
  config: ProtocolParserConfig,
  tombstones: ReadonlySet<string>
): string[] {
  const ids: string[] = [];
  let pending = "";
  for (const line of methodsText.split(/\n/)) {
    if (line.includes("\f") || PAGE_NOISE.test(line)) {
      pending = "";
      continue;
    }
    const tok = leftIdToken(line, config);
    if (!tok) continue;
    if (pending) {
      const joined = pending + tok;
      if (isFullRequirementId(joined, config)) {
        ids.push(joined);
        pending = "";
      } else if (isIdPrefix(joined)) {
        pending = joined;
      } else {
        pending = isIdPrefix(tok) ? tok : "";
      }
      continue;
    }
    if (isFullRequirementId(tok, config)) {
      ids.push(tok);
    } else if (isIdPrefix(tok)) {
      pending = tok;
    }
  }
  return uniqueIds(ids).filter((id) => !tombstones.has(id));
}

function leftIdToken(
  line: string,
  config: ProtocolParserConfig
): string | null {
  const whole = line.match(/^\s{0,5}(\S+)\s*$/);
  if (whole && isReqColumnToken(whole[1], config)) return whole[1];

  const fullSpaced = line.match(/^\s{0,5}(\S+)\s+/);
  if (fullSpaced && isFullRequirementId(fullSpaced[1], config)) {
    return fullSpaced[1];
  }

  const prefixSpaced = line.match(/^\s{0,5}(\S+)\s{2,}/);
  if (
    prefixSpaced &&
    (isIdPrefix(prefixSpaced[1]) || isIdContinuation(prefixSpaced[1]))
  ) {
    return prefixSpaced[1];
  }
  return null;
}

function isReqColumnToken(
  tok: string,
  config: ProtocolParserConfig
): boolean {
  return (
    isFullRequirementId(tok, config) ||
    isIdPrefix(tok) ||
    isIdContinuation(tok)
  );
}

function tildeHits(
  methodsSection: string,
  protocolText: string,
  methodsStart: number,
  config: ProtocolParserConfig
): TildeHit[] {
  const hits: TildeHit[] = [];
  const re = withGlobalLocal(config.tilde);
  let match: RegExpExecArray | null;
  while ((match = re.exec(methodsSection)) !== null) {
    const abs = methodsStart + match.index;
    const lineStart = protocolText.lastIndexOf("\n", abs) + 1;
    const lineEnd = protocolText.indexOf("\n", abs);
    const quote = protocolText
      .slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    hits.push({ page: pageAt(protocolText, abs), quote });
  }
  return hits;
}

function countNonNormative(
  methodsSection: string,
  config: ProtocolParserConfig
): NonNormativeHits {
  return {
    na: countMatches(methodsSection, config.nonNormative.na),
    should: countMatches(methodsSection, config.nonNormative.should),
    ifNeeded: countMatches(methodsSection, config.nonNormative.ifNeeded),
    appropriate: countMatches(methodsSection, config.nonNormative.appropriate),
  };
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(withGlobalLocal(pattern))?.length ?? 0;
}

function instrumentsNamed(
  methodsSection: string,
  config: ProtocolParserConfig
): string[] {
  const lower = methodsSection.toLowerCase();
  return config.instrumentLexicon.filter((name) => lower.includes(name));
}

function parseEquipmentTable(frontMatter: string): string[] {
  const start = frontMatter.search(/Table 2 Required Testing Equipment/);
  if (start < 0) return [];
  const rest = frontMatter.slice(start);
  const endMatch = rest.search(/\n\s*6\s+MATERIALS|\n\s*Table 3 /);
  const table = endMatch >= 0 ? rest.slice(0, endMatch) : rest;
  const skip =
    /table 2|equipment description|calibrated|equipment$|mfg & model/i;
  const names: string[] = [];
  for (const line of table.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || skip.test(trimmed)) continue;
    const name = trimmed.split(/\s{2,}/)[0]?.trim();
    if (!name || name.length < 3) continue;
    if (/^page\b/i.test(name)) continue;
    names.push(name);
  }
  return uniqueIds(names);
}

function parseReferencesTable(
  frontMatter: string,
  documentNoPattern: RegExp
): string[] {
  const start = frontMatter.search(/Table 1 References/);
  if (start < 0) return [];
  const rest = frontMatter.slice(start);
  const endMatch = rest.search(/\n\s*4\s+RESPONSIBILITIES|\n\s*5\s+EQUIPMENT/);
  const table = endMatch >= 0 ? rest.slice(0, endMatch) : rest;
  return uniqueIds(table.match(withGlobalLocal(documentNoPattern)) ?? []);
}
