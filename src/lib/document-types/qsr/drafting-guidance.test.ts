import { describe, expect, it } from "vitest";
import { QSR_DRAFTING_GUIDANCE } from "./drafting-guidance";

describe("QSR_DRAFTING_GUIDANCE", () => {
  it("requires verbatim URS rows and keyed banner inserts on the RTM", () => {
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "Copy the URS ID and requirement text word for word"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain("Never merge two requirements");
    expect(QSR_DRAFTING_GUIDANCE).toContain("process → 5.1 Process Requirements");
    expect(QSR_DRAFTING_GUIDANCE).toContain("safety → 5.4 Safety Requirements");
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "do not invent equipment or materials the URS does not list"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "never write Complies, Section 13, or a stock IQ page"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain('{ banner: "…" }');
    expect(QSR_DRAFTING_GUIDANCE).toContain("Prefer afterRowKey");
  });
});
