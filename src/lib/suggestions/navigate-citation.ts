export function citationSourceElementId(n: number): string {
  return `citation-source-${n}`;
}

export function citationNumberFromClickTarget(
  target: EventTarget | null
): number | null {
  if (!(target instanceof Element)) return null;
  const ref = target.closest("[data-citation-number]");
  if (!ref) return null;
  const n = Number(ref.getAttribute("data-citation-number"));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function scrollElement(el: HTMLElement, block: ScrollLogicalPosition): void {
  el.scrollIntoView({ behavior: "smooth", block });
}

export function scrollToCitationSource(n: number): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(citationSourceElementId(n));
  if (!el) return false;
  scrollElement(el, "nearest");
  el.setAttribute("data-active", "true");
  window.setTimeout(() => {
    el.removeAttribute("data-active");
  }, 1600);
  return true;
}

export function scrollToCitationMarker(n: number): boolean {
  if (typeof document === "undefined") return false;
  const el = document.querySelector<HTMLElement>(
    `.citation-ref[data-citation-number="${n}"]`
  );
  if (!el) return false;
  scrollElement(el, "center");
  return true;
}
