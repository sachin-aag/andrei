import {
  CONVERGENT_DV_TABLE_SECTIONS,
  CONVERGENT_EQUIPMENT_HEADERS,
  CONVERGENT_RESULTS_HEADERS,
  dvFixedTableFormatGuidance,
} from "@/lib/document-types/design-verification/sections";
import { CONVERGENT_DV_SECTION_LABELS } from "./sections";

const EQUIPMENT_HEADER_LINE = CONVERGENT_EQUIPMENT_HEADERS.join(" | ");
const RESULTS_HEADER_LINE = CONVERGENT_RESULTS_HEADERS.join(" | ");

/**
 * Chat drafting rules taken from the Convergent software DV report recipe:
 * paragraph counts, approximate word counts, execution-block shape, and
 * table schemas. Sample lengths are targets, not hard caps.
 */
export const CONVERGENT_RECIPE_DRAFTING_GUIDANCE = `${dvFixedTableFormatGuidance({
  surface: "chat",
  sections: CONVERGENT_DV_TABLE_SECTIONS,
  labels: CONVERGENT_DV_SECTION_LABELS,
})}

## Report shape (required)

Real Convergent software DV reports are organized by **execution block**. Oldest
test-plan revision first, most recent last. Open each block with a bold
sub-heading:

- First block: \`Testing per <test plan number> Rev. <letter>:\`
- Later blocks: \`Rev <letter> of Test Report (Testing per <test plan number> Rev. <letter>)\`

Match the paragraph counts and approximate word counts below. If a fact is
missing, use a bracketed placeholder rather than inventing it or padding.

## Purpose — 4 paragraphs, ~200 words (omit paragraph 2 if a single full execution)

targetField \`narrative\`.

1. ~60 words. This revision presents results of the full or partial execution of
   the named protocol (number + revision). Name the software application, version,
   controlled document number + revision, and release type. Close with what the
   build was for (patch, bug fixes, new feature). Do not mention configurations,
   requirements, deviations, or results.
2. ~50 words. **Omit entirely** when this report documents a single full
   execution. If this is a partial execution: because not all requirements were
   tested, the report also carries the most recent full execution — name that
   report revision and the software version it covered. Do not summarise findings.
3. Lead-in + bulleted VCS list (~100 words including bullets). Convergent Dental
   software version control is \`mm.nn.ff.bb\` (major, minor, fix, build).
4. ~40 words. The build number is an internal identifier and may be omitted; the
   fix number then defines the release. There is only one major/minor/fix
   combination per release.

## Scope — 2 paragraphs (~190 words) + 1 table

targetField \`narrative\` (prose AND the Software Under Test table).

1. ~77 words. Product this report applies to; how configurations are tracked
   (TOP / CUS / SUB IDs); what makes each configuration different (laser
   controller); where requirements are documented (requirements document number
   + revision) and which test plan revision was executed.
2. ~114 words. Whether testing ran on all configurations, and the three reasons
   a requirement might not be repeated on every platform (no hardware dependency,
   identical hardware, or applies to one platform only). If partial, name the
   last full execution and subsequent partial executions by test-plan revision.

Then a 2-column table captioned like \`Table 1: Software Under Test\`:

| Solea Model 3.0 SW Application Version | Reason for Build |
| --- | --- |
| Testing per <test plan> Rev. <letter> |  |

Segregate rows by test-plan revision (oldest block first). Under each separator,
list each software version and a differentiated reason for that build. Do not
put the Requirements Verified matrix here.

## Testers/Dates — one block per execution, ~124 words for two executions

targetField \`testers\`. Dates belong in this narrative. There are no separate start/end date fields.

Per execution block:
1. Bold sub-heading (~5 words): \`Testing per <test plan> Rev. <letter>:\`
2. ~25–35 words. Name every tester in full, with job title and affiliation
   (employee, intern, contractor), plus calendar start and end dates.
3. ~50 words, **omit** if every tester signed their own datasheets. If someone
   else signed: why, who signed, and that person's title.
4. Next execution: bold sub-heading \`Rev <letter> of Test Report (Testing per …)\`
   then the tester/date sentence for that execution.

## Methods of Measurement — one block per execution; do **not** put the equipment table here

targetField \`narrative\`. Test Equipment is a separate section.

Per execution block, same four labelled sub-sections in this order:

1. Bold sub-heading: \`Testing per <test plan> Rev. <letter>:\`
2. **Executed Protocol:** one sentence (~6 words). Full or partial execution of
   \`<protocol> Rev. <letter>\`. No supporting detail (that belongs in Scope).
3. **Protocol Modifications:**
   - Full execution: ~56 words. Count spelled out and in numerals, protocol
     cited, what changed (typos, nomenclature, methods no longer applicable),
     and that changes go into the next protocol release.
   - Partial execution: 2 short sentences (~18 words each) listing test cases
     added and test cases modified (requirement IDs).
4. **Units Under Test (UUTs):** ~113 words. Point to the UUT Data Sheet by
   section number in the executed protocol and the appendix it is attached in.
   State system count (spelled out + numerals), breakdown by configuration and
   laser controller, and how many distinct UUTs those systems represented.

## Test Equipment — lead-in + table per execution

targetField \`table\`. Exception to the usual "table only" rule: a one-line
lead-in is required before each table.

Lead-in (~17 words), starting: "The table below lists all equipment used for
testing during the [full/partial] execution of the test protocol."

Caption like \`Table 2. Test Equipment (Applicable to <test plan> Rev. <letter>)\`.
Then ONE GFM table per execution with headers exactly:

| ${EQUIPMENT_HEADER_LINE} |
| --- | --- | --- | --- | --- |

Systems under test first, then measurement instruments. Every row needs a CD
asset tag and/or serial number. Calibration Due is month-and-year for
instruments and N/A for systems under test.

## Deviations — one block per execution; numbered 4-paragraph entries

targetField \`narrative\`.

Per block:
1. Bold sub-heading naming the test-plan revision.
2. Lead-in (~36 words): count spelled out and in numerals; full or partial;
   protocol number + revision; appendix holding approved deviation forms
   (relative to completed datasheets). Numbering restarts each block (#01, #02).

Each deviation (repeat):
1. Bold identifier, two lines: \`Deviation #01:\` then \`Requirement(s): <IDs>\`.
2. Observation (~11–64 words, past tense): what was seen only — quotes, error
   codes, version numbers. No cause or fix.
3. Analysis (~29–132 words): why it occurred; software vs requirement/test-case
   at fault; documents that will change.
4. Resolution (~41–103 words): corrected in a named software version and
   confirmed in a named regression round, **or** "No immediate action is
   required" plus the document that will be updated. Close with the JIRA ticket.

## Results and Discussion — TWO draft_field calls

**Discussion** (targetField \`narrative\`) — prose only, no markdown table:

Per execution block:
1. Bold sub-heading naming the test-plan revision.
2. **Data Collection Forms:** one sentence (~13 words) naming the appendix.
3. **Requirements Verified:**
   - Full execution: ~42 words. All requirements in the named requirements
     document were verified during the full execution of the named protocol.
     Point to the appendix with the executed protocol.
   - Partial execution: heading only in Discussion — the matrix goes in \`table\`.
4. **Observations:** one observation per paragraph (stage noticed, whether it
   failed a requirement, disposition / software version). If none: one sentence
   (~11 words), "No additional observations were made outside the scope of the
   protocol."

**Results matrix** (targetField \`table\`) — ONE GFM table, headers exactly:

| ${RESULTS_HEADER_LINE} |
| --- | --- | --- | --- |

Use this table for a **partial** execution (one row per requirement tested).
For a full execution whose coverage is the narrative statement above, leave the
seeded header row and do not invent extra rows.

- Req. Description quotes requirement text verbatim, including applicability notes.
- Satisfied by names the configuration datasheets and the appendix
  (example: \`TOP-00017 PCON datasheets (See Appendix B)\`).
- P/F is per configuration, not a bare Pass/Fail:
  \`P for TOP-00017 PCON\` or
  \`P for TOP-00051, TOP-00017 PCON and TOP-00017 LCD-2\`.
- Requirements run on more than one configuration list every configuration in
  both Satisfied by and P/F. Keep one row per Req. ID.
- Preserve dotted suffixes (\`SW-SST-5.1.1\` is not \`SW-SST-5\`).

## Problem or Failure Resolution — one block per execution, summarise the arc

targetField \`narrative\`. This section is the story of regression rounds;
Deviations is the record. Do not duplicate deviation detail.

Per block:
1. Bold sub-heading.
2. Initial execution (~146 words): software version, configurations, how many
   tests failed and how many deviations (spelled out + numerals), immediate vs
   deferred, the build produced, configurations retested, outcome.
3. Later rounds (~230 words total): each subsequent round in order — what
   prompted it, whether it failed a requirement, build, configurations, result,
   why a round was limited to one configuration, supplemental test cases.
   End with the final software version.

If a partial execution had no failures: ~2 short paragraphs stating each
deviation and why it did not affect formal execution.

## Conclusion — one paragraph per execution, no bullets

targetField \`narrative\`.

Per block: bold sub-heading, then one paragraph.
- Full execution with regressions: ~265 words. Name report revision, protocol,
  full/partial, configurations, software version; walk the build history;
  close with: "… has been deemed acceptable for release" naming the final
  version.
- Partial with no failures: ~67 words. State that plainly and go to the
  acceptability sentence.

Make no claim that Results and Discussion / Problem or Failure Resolution do
not already support.
`;
