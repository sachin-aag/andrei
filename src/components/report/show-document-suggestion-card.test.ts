import { describe, expect, it } from "vitest";
import {
  isReviewGutterColumnPainted,
  showDocumentSuggestionCard,
} from "./show-document-suggestion-card";

describe("isReviewGutterColumnPainted", () => {
  it("is false when the aside is missing or collapsed", () => {
    expect(isReviewGutterColumnPainted(null)).toBe(false);
    expect(isReviewGutterColumnPainted(undefined)).toBe(false);
    expect(isReviewGutterColumnPainted({ offsetWidth: 0, offsetHeight: 0 })).toBe(
      false
    );
    expect(isReviewGutterColumnPainted({ offsetWidth: 208, offsetHeight: 0 })).toBe(
      false
    );
    expect(isReviewGutterColumnPainted({ offsetWidth: 0, offsetHeight: 400 })).toBe(
      false
    );
  });

  it("is true when the review margin occupies a box", () => {
    expect(
      isReviewGutterColumnPainted({ offsetWidth: 208, offsetHeight: 640 })
    ).toBe(true);
  });
});

describe("showDocumentSuggestionCard", () => {
  it("always keeps the review-margin copy", () => {
    expect(
      showDocumentSuggestionCard({
        documentSlot: false,
        gutterColumnPainted: true,
        sectionHasGutterCard: true,
      })
    ).toBe(true);
  });

  it("keeps the in-document card when Comments is off or the margin is hidden", () => {
    expect(
      showDocumentSuggestionCard({
        documentSlot: true,
        gutterColumnPainted: false,
        sectionHasGutterCard: true,
      })
    ).toBe(true);
  });

  it("keeps leftover in-document cards the gutter never shows", () => {
    expect(
      showDocumentSuggestionCard({
        documentSlot: true,
        gutterColumnPainted: true,
        sectionHasGutterCard: false,
      })
    ).toBe(true);
  });

  it("hides the in-document card when the gutter already shows that section", () => {
    expect(
      showDocumentSuggestionCard({
        documentSlot: true,
        gutterColumnPainted: true,
        sectionHasGutterCard: true,
      })
    ).toBe(false);
  });
});
