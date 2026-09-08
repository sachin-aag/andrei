import { Fragment, type ReactNode } from "react";
import {
  citationNumberFromMarker,
  isNumericCitationMarker,
  parseSourceCitation,
} from "@/lib/placeholders/citation-bracket";

const CITATION_SPLIT_RE = /(\[[^\]]+\])/g;
const EMPTY_NUMBERED = new Map<number, string>();

function citationOpenRaw(
  token: string,
  numbered: ReadonlyMap<number, string>
): string | null {
  if (!/^\[[^\]]+\]$/.test(token)) return null;
  if (parseSourceCitation(token)) return token;
  if (!isNumericCitationMarker(token)) return null;
  const number = citationNumberFromMarker(token);
  if (number == null) return null;
  return numbered.get(number) ?? null;
}

/**
 * Turns `[filename, p. N]` (and numbered `[n]` when a Citations list
 * maps it) into clickable buttons inside chat markdown.
 */
export function linkifyCitationText(
  text: string,
  onOpen: (raw: string) => void,
  numbered: ReadonlyMap<number, string> = EMPTY_NUMBERED
): ReactNode {
  if (!text.includes("[")) return text;
  const parts = text.split(CITATION_SPLIT_RE);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const openRaw = citationOpenRaw(part, numbered);
    if (!openRaw) {
      return <Fragment key={i}>{part}</Fragment>;
    }
    return (
      <button
        key={i}
        type="button"
        data-testid="citation-link"
        className="citation-source"
        title={`Open ${openRaw.slice(1, -1)}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpen(openRaw);
        }}
      >
        {part}
      </button>
    );
  });
}

export function linkifyCitationChildren(
  children: ReactNode,
  onOpen: (raw: string) => void,
  numbered: ReadonlyMap<number, string> = EMPTY_NUMBERED
): ReactNode {
  if (typeof children === "string") {
    return linkifyCitationText(children, onOpen, numbered);
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        return (
          <Fragment key={i}>
            {linkifyCitationText(child, onOpen, numbered)}
          </Fragment>
        );
      }
      return child;
    });
  }
  return children;
}
