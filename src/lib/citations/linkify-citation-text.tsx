import { Fragment, type ReactNode } from "react";
import {
  citationNumberFromMarker,
  isNumericCitationMarker,
  sourceCitationLinkSpans,
} from "@/lib/placeholders/citation-bracket";

const CITATION_SPLIT_RE = /(\[[^\]]+\])/g;
const EMPTY_NUMBERED = new Map<number, string>();

function citationButton(
  key: string,
  text: string,
  openRaw: string,
  onOpen: (raw: string) => void
) {
  return (
    <button
      key={key}
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
      {text}
    </button>
  );
}

function renderCitationToken(
  token: string,
  onOpen: (raw: string) => void,
  numbered: ReadonlyMap<number, string>
): ReactNode {
  if (isNumericCitationMarker(token)) {
    const number = citationNumberFromMarker(token);
    const parked = number != null ? numbered.get(number) : undefined;
    const parkedSpans = parked ? sourceCitationLinkSpans(parked) : [];
    const openRaw = parkedSpans[0]?.openRaw ?? parked ?? null;
    if (!openRaw) return token;
    return citationButton("n", token, openRaw, onOpen);
  }

  const spans = sourceCitationLinkSpans(token);
  if (spans.length === 0) return token;
  if (spans.length === 1 && spans[0]!.from === 0 && spans[0]!.to === token.length) {
    return citationButton("0", token, spans[0]!.openRaw, onOpen);
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, idx) => {
    if (span.from > cursor) {
      nodes.push(
        <Fragment key={`t-${idx}`}>{token.slice(cursor, span.from)}</Fragment>
      );
    }
    nodes.push(
      citationButton(
        `l-${idx}`,
        token.slice(span.from, span.to),
        span.openRaw,
        onOpen
      )
    );
    cursor = span.to;
  });
  if (cursor < token.length) {
    nodes.push(<Fragment key="tail">{token.slice(cursor)}</Fragment>);
  }
  return nodes;
}

/**
 * Turns `[filename, p. N]` (and numbered `[n]` when a Citations list
 * maps it) into clickable buttons inside chat markdown. Combined
 * `[A.pdf, p. 1, B.pdf, p. 2]` becomes two links.
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
    if (!/^\[[^\]]+\]$/.test(part)) {
      return <Fragment key={i}>{part}</Fragment>;
    }
    const rendered = renderCitationToken(part, onOpen, numbered);
    if (rendered === part) {
      return <Fragment key={i}>{part}</Fragment>;
    }
    return <Fragment key={i}>{rendered}</Fragment>;
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
