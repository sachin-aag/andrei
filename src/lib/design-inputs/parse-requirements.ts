import type { ProtocolParserConfig } from "./types";
import type { Requirement } from "./types";
import { extractRequirementIds, familyFromReqId } from "./ids";

export function parseRequirements(
  srsText: string,
  config: ProtocolParserConfig
): Requirement[] {
  const cutAt = srsText.lastIndexOf(config.revHistoryMarker);
  const body = cutAt >= 0 ? srsText.slice(0, cutAt) : srsText;
  const lines = body.split(/\n/);
  const byId = new Map<string, { lines: string[] }>();
  const order: string[] = [];
  let current: { id: string; lines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(config.requirementIdLine);
    if (match) {
      const id = match[2];
      const rest = match[3] ?? "";
      if (!byId.has(id)) {
        current = { id, lines: [rest] };
        byId.set(id, current);
        order.push(id);
      } else {
        current = null;
      }
      continue;
    }
    if (current) current.lines.push(line);
  }

  return order.map((id) => {
    const text = (byId.get(id)?.lines ?? [])
      .join("\n")
      .replace(/\s+/g, " ")
      .trim();
    return {
      id,
      text,
      family: familyFromReqId(id, config.family),
      removedInRev: removedInRev(text, config),
      deferred: config.deferred.test(text),
      applicabilityNote: applicabilityNote(text, config),
    };
  });
}

export function liveRequirements(requirements: Requirement[]): Requirement[] {
  return requirements.filter((req) => req.removedInRev === null);
}

export function extractIdsFromText(
  text: string,
  config: ProtocolParserConfig
): string[] {
  return extractRequirementIds(text, config.requirementId);
}

function removedInRev(
  text: string,
  config: ProtocolParserConfig
): string | null {
  const match = text.match(config.removed);
  return match?.[1] ?? null;
}

function applicabilityNote(
  text: string,
  config: ProtocolParserConfig
): string | null {
  for (const rule of config.applicabilityRules) {
    rule.pattern.lastIndex = 0;
    const match = text.match(rule.pattern);
    if (match) return match[0].replace(/\s+/g, " ").trim();
  }
  return null;
}
