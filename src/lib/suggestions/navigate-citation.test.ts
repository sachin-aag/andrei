// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  citationNumberFromClickTarget,
  citationSourceElementId,
  scrollToCitationMarker,
  scrollToCitationSource,
} from "./navigate-citation";

describe("navigate-citation", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("maps a bubble click target to its citation number", () => {
    const span = document.createElement("span");
    span.className = "citation-ref";
    span.dataset.citationNumber = "2";
    const inner = document.createElement("span");
    span.appendChild(inner);
    expect(citationNumberFromClickTarget(inner)).toBe(2);
    expect(citationNumberFromClickTarget(document.createElement("p"))).toBeNull();
  });

  it("scrolls between a parked source and its in-body bubble", () => {
    HTMLElement.prototype.scrollIntoView = function () {};
    const marker = document.createElement("span");
    marker.className = "citation-ref";
    marker.dataset.citationNumber = "1";
    const source = document.createElement("button");
    source.id = citationSourceElementId(1);
    document.body.append(marker, source);

    const sourceView = vi.spyOn(source, "scrollIntoView").mockImplementation(() => {});
    const markerView = vi.spyOn(marker, "scrollIntoView").mockImplementation(() => {});

    expect(scrollToCitationSource(1)).toBe(true);
    expect(source.getAttribute("data-active")).toBe("true");
    expect(sourceView).toHaveBeenCalled();

    expect(scrollToCitationMarker(1)).toBe(true);
    expect(markerView).toHaveBeenCalled();
    expect(scrollToCitationSource(9)).toBe(false);
  });
});
