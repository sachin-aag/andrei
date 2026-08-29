import { describe, expect, it } from "vitest";
import { askedToReplaceWholeField } from "./whole-field-replace";

describe("askedToReplaceWholeField", () => {
  it("treats the Purpose versioning removal as a targeted edit", () => {
    expect(
      askedToReplaceWholeField(
        "remove the versioning details in the purpose section"
      )
    ).toBe(false);
    expect(
      askedToReplaceWholeField("delete the software versions from Purpose")
    ).toBe(false);
    expect(
      askedToReplaceWholeField("strip the version numbers from @Purpose")
    ).toBe(false);
  });

  it("treats sentence and paragraph rewrites as targeted", () => {
    expect(
      askedToReplaceWholeField("rewrite the first paragraph in purpose")
    ).toBe(false);
    expect(askedToReplaceWholeField("rewrite this sentence")).toBe(false);
    expect(
      askedToReplaceWholeField("replace the version numbers in purpose")
    ).toBe(false);
  });

  it("allows an explicit whole-field replace", () => {
    expect(askedToReplaceWholeField("rewrite the purpose section")).toBe(true);
    expect(askedToReplaceWholeField("replace the purpose")).toBe(true);
    expect(askedToReplaceWholeField("redraft the define section")).toBe(true);
    expect(askedToReplaceWholeField("start over on purpose")).toBe(true);
    expect(askedToReplaceWholeField("rewrite the whole section")).toBe(true);
    expect(askedToReplaceWholeField("replace this field from scratch")).toBe(
      true
    );
  });

  it("does not treat draft/fill/add as a whole-field replace", () => {
    expect(askedToReplaceWholeField("draft the purpose section")).toBe(false);
    expect(
      askedToReplaceWholeField("add a sentence about partial execution")
    ).toBe(false);
    expect(askedToReplaceWholeField("")).toBe(false);
  });
});
