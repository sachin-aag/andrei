import { describe, expect, it } from "vitest";
import {
  isTrackChangesFieldEditable,
  shouldAutosaveSection,
} from "./section-save-policy";

const author = { id: "engineer-1", role: "engineer" as const };
const manager = { id: "manager-1", role: "manager" as const };

const draft = { authorId: author.id, status: "draft" as const, deletedAt: null };
const submitted = {
  authorId: author.id,
  status: "submitted" as const,
  deletedAt: null,
};
const inReview = {
  authorId: author.id,
  status: "in_review" as const,
  deletedAt: null,
};
const feedback = {
  authorId: author.id,
  status: "feedback" as const,
  deletedAt: null,
};
const approved = {
  authorId: author.id,
  status: "approved" as const,
  deletedAt: null,
};

describe("isTrackChangesFieldEditable", () => {
  it("allows engineer edit mode", () => {
    expect(
      isTrackChangesFieldEditable({
        readOnly: false,
        trackChangesMode: false,
      })
    ).toBe(true);
  });

  it("blocks report-level read-only unless track changes is on", () => {
    expect(
      isTrackChangesFieldEditable({
        readOnly: true,
        trackChangesMode: false,
      })
    ).toBe(false);
    expect(
      isTrackChangesFieldEditable({
        readOnly: true,
        trackChangesMode: true,
      })
    ).toBe(true);
  });

  it("keeps explicitly locked fields read-only even with track changes", () => {
    expect(
      isTrackChangesFieldEditable({
        locked: true,
        readOnly: false,
        trackChangesMode: true,
      })
    ).toBe(false);
  });
});

describe("shouldAutosaveSection", () => {
  it("enables manager autosave on submitted/in_review when track changes is on", () => {
    expect(
      shouldAutosaveSection({
        user: manager,
        report: submitted,
        readOnly: true,
        trackChangesMode: true,
      })
    ).toBe(true);
    expect(
      shouldAutosaveSection({
        user: manager,
        report: inReview,
        readOnly: true,
        trackChangesMode: true,
      })
    ).toBe(true);
  });

  it("does not autosave for managers when track changes is off", () => {
    expect(
      shouldAutosaveSection({
        user: manager,
        report: submitted,
        readOnly: true,
        trackChangesMode: false,
      })
    ).toBe(false);
  });

  it("does not autosave for managers after feedback or approval", () => {
    expect(
      shouldAutosaveSection({
        user: manager,
        report: feedback,
        readOnly: true,
        trackChangesMode: true,
      })
    ).toBe(false);
    expect(
      shouldAutosaveSection({
        user: manager,
        report: approved,
        readOnly: true,
        trackChangesMode: true,
      })
    ).toBe(false);
  });

  it("enables author autosave on draft and feedback", () => {
    expect(
      shouldAutosaveSection({
        user: author,
        report: draft,
        readOnly: false,
        trackChangesMode: false,
      })
    ).toBe(true);
    expect(
      shouldAutosaveSection({
        user: author,
        report: feedback,
        readOnly: false,
        trackChangesMode: false,
      })
    ).toBe(true);
  });

  it("does not autosave for the author on a submitted report", () => {
    expect(
      shouldAutosaveSection({
        user: author,
        report: submitted,
        readOnly: true,
        trackChangesMode: false,
      })
    ).toBe(false);
  });

  it("pauses while a suggestion apply is in flight or a prior save was blocked", () => {
    expect(
      shouldAutosaveSection({
        user: manager,
        report: submitted,
        readOnly: true,
        trackChangesMode: true,
        applyInFlight: true,
      })
    ).toBe(false);
    expect(
      shouldAutosaveSection({
        user: manager,
        report: submitted,
        readOnly: true,
        trackChangesMode: true,
        saveBlocked: true,
      })
    ).toBe(false);
  });

  it("returns false without a user or report", () => {
    expect(
      shouldAutosaveSection({
        user: null,
        report: submitted,
        readOnly: true,
        trackChangesMode: true,
      })
    ).toBe(false);
    expect(
      shouldAutosaveSection({
        user: manager,
        report: null,
        readOnly: true,
        trackChangesMode: true,
      })
    ).toBe(false);
  });
});
