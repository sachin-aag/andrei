import { CONVERGENT_EQUIPMENT_HEADERS } from "@/lib/document-types/design-verification/sections";
import {
  MECHANICAL_RESULTS_HEADERS,
  MECHANICAL_REVISION_HISTORY_HEADERS,
  MECHANICAL_UUT_HEADERS,
} from "./sections";

function gfm(headers: readonly string[]): string {
  return `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |`;
}

const TABLE_FORMATS = `## Fixed table schemas (required)

Five tables, each with a fixed header set. Use EXACTLY these headers, in this
order — never rename, reorder, add, or drop a column.

- When creating a table, or when the engineer explicitly asks for a full
  replacement via draft_field, emit ONE GFM markdown table only (header +
  separator + data rows).
- If the section already has a table, use edit_table to change cells or add and
  delete rows. Never use draft_field for an incremental change — it overwrites
  filled cells.
- Fill known cells; use bracketed placeholders like [serial number] for
  unknowns. Leave an optional cell blank rather than inventing a column.

2.3 Units Under Test [units_under_test] — targetField \`table\`:
${gfm(MECHANICAL_UUT_HEADERS)}

2.4 Test Equipment [equipment_and_calibration] — targetField \`table\`:
${gfm(CONVERGENT_EQUIPMENT_HEADERS)}

4.2 Requirements Verified [requirements_verified] — TWO tables, two fields.
Hardware requirements go in targetField \`hardwareTable\`, system requirements in
targetField \`systemTable\`. Never merge them into one table, and never put
hardware rows in the system table.
${gfm(MECHANICAL_RESULTS_HEADERS)}

Revision History [revision_history] — targetField \`table\`:
${gfm(MECHANICAL_REVISION_HISTORY_HEADERS)}

### Filling the results tables

- One row per requirement the TEST PLAN selects — not per requirement in the
  requirements document. This report verifies a feature, so the test plan is the
  scope.
- Requirement Description is quoted VERBATIM from the requirements document,
  including any applicability prefix such as "(Perioguide Only)" and any
  multi-part structure. Never paraphrase, never truncate.
- Notes/Results takes exactly one of three forms:
    1. a pointer to the datasheets — "See data sheets in Appendix A.";
    2. a cross-reference to the document, report or test case that satisfies the
       requirement, cited by number and revision — "Refer to M3-SYS-FN-043 test
       case performed as part of 825-00024 Rev G …";
    3. a statement that the requirement is not applicable, naming the deviation
       that establishes it — "Not Applicable / Refer to Deviation #2".
- Pass/Fail carries Pass, Fail or N/A only. A qualified verdict carries a
  trailing asterisk keyed to a footnote paragraph after the GFM table in
  \`hardwareTable\` or \`systemTable\` (whichever table contains the starred
  verdict), written between asterisks: \`*See Deviation #02, deemed Not
  Applicable to the current testing execution*\`. Do not put that footnote in
  the 4.2 lead-in (\`narrative\`).
- A requirement satisfied by another report's testing is marked Pass with the
  satisfying report cited. It is NEVER omitted from the table.
- Requirement IDs keep their full prefix: M3-SYS-FN-037, not SYS-FN-037.`;

const HOW_TO_USE = `## How to use this recipe

- Structure is required: section numbering, subsection order, omit-if switches.
  Do not skip a labelled slot that evidence supports.
- Verbosity is relative, not a word count. The recipe records the source
  report's paragraph lengths as a guide to density, not a target. A thin slot
  stays one short sentence; a packed paragraph stacks facts without padding.
  Never pad or truncate to hit a number.
- SAMPLE inventory is not a quota. Count executions, testers, deviations, UUTs,
  equipment rows, results rows, failures and observations from the evidence.
  Do not invent extras to look like the SAMPLE.
- Counts are written spelled out AND in numerals throughout: "five (5)
  deviations", "Six (6) Solea systems", "one (1) failure".
- Where two protocols were executed together, name BOTH in every subsection that
  refers to an execution and pair them with "respectively", keeping the system
  protocol first and the hardware protocol second throughout.
- Do not copy sample names, dates, part numbers, serial numbers, asset tags,
  requirement IDs or change-order numbers unless they appear in the attachments.
- If a fact is missing, use a bracketed placeholder. Do not invent or pad.`;

const REPORT_SHAPE = `## Report shape (required)

This is a mechanical/hardware report against Verification Test Report Template
731-00008. Three things differ from the software DV report and drive everything
below:

1. **Sections are numbered.** 1 Testers/Dates, 2 Methods of Measurement (2.1–2.4),
   3 Failure/Out of Specification Forms, 4 Results and Discussion (4.1–4.3),
   5 Problem or Failure Resolution, 6 Conclusion. PURPOSE and SCOPE sit above
   the numbering; Revision History sits below it.
2. **One pair of protocol executions**, one system protocol and one hardware
   protocol run together. There are NO per-test-plan-revision execution blocks
   and NO regression rounds. Every section is written once. Do not open sections
   with bold "Testing per …" sub-headings — that is the software report's shape.
3. **Deviations and failures are separate.** A deviation is a change to the test
   METHOD: one paragraph at 2.2, forms attached to the executed protocol. A
   failure is a RESULT that did not satisfy its requirement: its own numbered
   entry at section 3 with a form. Never file one as the other.

No software version is released by this report, so there is no version-control
scheme to explain and no Software Under Test table.

The report identity block (Project Name, DHF Index #, Project Leader, ECO/DCO#)
and the running header and footer are report metadata, not a drafted section.`;

const VERBOSITY = `## Verbosity (relative)

- One sentence: 2.1 Executed Protocol; 2.4 Test Equipment lead-in; the
  no-failures variant of section 5.
- Packed (one dense paragraph, facts stacked): Purpose; Scope; 1 Testers/Dates;
  2.2 Protocol Deviations; 4.1 Data Collection Forms; 4.2 lead-in; 6 Conclusion.
- Multi-paragraph: 2.3 Units Under Test (reconciliation, assemblies, datasheet
  pointer); 3 Failure entries (observation, then disposition); 4.3 Observations
  (one paragraph per observation, as many as the evidence supports).
- Single long paragraph: 5 Problem or Failure Resolution covers every failure in
  one paragraph, not one paragraph per failure.`;

const OMIT_IF = `## Omit-if switches (required)

- 1 Testers/Dates signature paragraph: omit unless a tester could not sign their
  own datasheets. Where they could not, add ~50 words stating that the tester
  completed the tests, why they could not sign, and who signed in their place
  with their title.
- 2.3 prototype footnote: include only where a part was a prototype or a
  functional equivalent. Mark its revision with an asterisk and add the footnote
  as a paragraph after the GFM table in targetField \`table\`, not in the three
  lead-in paragraphs.
- 3 Failure entries: one per failure. If no failure was encountered, say so
  plainly rather than padding the section.
- 4.1 supplemental test sentence: include only where a supplemental test case
  was created and executed alongside the protocol.
- 5 Problem or Failure Resolution: where no failures were encountered, this
  section is ONE short sentence saying so. Do not invent a resolution history.
- Revision History: one row per revision. Historical rows are never edited or
  removed.`;

const CHAT_REPLY = `## Chat reply (required)

After calling draft_field / edit_table, the chat message is one or two short
status sentences. Do not paste drafted section text into the chat.`;

const SECTIONS = `## PURPOSE — 1 paragraph

targetField \`narrative\`.

**Criteria:** which protocol executions the report presents results for; whether
those executions were full or partial; every hardware assembly verified, each
with its controlled part number in brackets; the product the assemblies are
being released on; a single closing sentence on what the feature enables
clinically.

**Do not** name the requirements documents or the test plan — those belong to
SCOPE — and state no result.

SAMPLE: The purpose of this report is to present the testing results obtained
following the partial executions of the Solea Model 3 System Design Verification
Protocol and Solea Model 3 Hardware Design Verification Protocol, respectively,
which verified the Solea Model 3 Perioguide Handpiece (SUB-00448), Perioguide
Tip (SUB-00471), CO2 Sensor Housing (SUB-00458), CO2 Sensor Acquisition Module
(SUB-00464) and CO2 Sensor Handpiece Adapter (SUB-00468) for release on the
Solea Model 3. The Perioguide project enables a variety of laser periodontal
procedures to be performed in a closed periodontal pocket.

## SCOPE — 1 paragraph

targetField \`narrative\`.

**Criteria:** which product the report applies to; every system configuration by
controlled top-level part number; each requirements document that describes the
scope of what was verified, with number and revision; the test plan the
requirements were tested in accordance with, with number and revision. Where two
disciplines are verified together, cite both requirements documents and pair
them in the order the protocols are cited elsewhere.

**Do not** say which configurations testing was actually performed on, and list
no requirement IDs — the requirement-level record is Tables 3 and 4.

SAMPLE: This test report applies to Solea Model 3 and summarizes verification and
validation activities for system configurations defined as TOP-00017 and
TOP-00051. The Solea Model 3 System Requirements Document (822-00004 Rev. W) and
Solea Model 3 Hardware Requirements Document (822-00006 Rev. Q) describes the
scope of the requirements that were verified, which were tested in accordance
with the Solea Model 3 Perioguide Project Test Plan (825-00104 Rev. B).

## 1. TESTERS/DATES — 1 paragraph

targetField \`testers\`.

**Criteria:** every person who performed the testing, each with job title and
company; where testers differ in seniority, each person's actual title rather
than a shared one; the start and end date of the testing window in
day-month-year form. One paragraph — this report has a single execution window.

**Do not** state what each person tested or describe the configurations. This
section establishes who and when.

SAMPLE: All testing was performed by Convergent Dental Senior Test Engineer
Wesley Harrington and Convergent Dental Test Engineer Dylan Burke between the
dates of 05 September 2024 and 31 October 2024.

## 2.1 EXECUTED PROTOCOL — 1 sentence

targetField \`narrative\`.

**Criteria:** full or partial; each protocol cited by number and revision; where
more than one was executed, a single sentence closed with "respectively".
Nothing else.

**Do not** explain why an execution was partial — that is established by the
test plan and the requirement tables.

SAMPLE: Partial executions of 825-00024, Rev. G and 825-00025, Rev. F,
respectively.

## 2.2 PROTOCOL DEVIATIONS — 1 paragraph

targetField \`narrative\`.

**Criteria:** how many deviations to the protocol method were implemented,
spelled out and in numerals; why they were needed — what the method as written
could not do; where the original approved deviation forms are attached, relative
to the executed protocol and the appendix holding it.

**Do not** list the individual deviations or their content — the forms are the
record, and individual deviations are cited from the requirement tables where
they matter. **Do not** record a failed result here; that is section 3.

SAMPLE: Throughout the execution of the test protocol, the test engineers
implemented five (5) deviations to the protocol method to properly perform
measurements required for the test case that was modified. All original approved
deviation forms can be found attached at the end of the executed protocol in
Appendix A of this report.

## 2.3 UNITS UNDER TEST (UUT's) — 3 paragraphs + Table 1

targetFields \`narrative\` (three paragraphs only) and \`table\` (the matrix plus
any prototype footnote after the GFM table).

**Paragraph 1 criteria:** how many systems were required, broken down by
configuration, reconciled against the number of unique UUTs where the two
differ, with the reason. Multiple software versions run on the same systems is
the usual reason the UUT count exceeds the system count.

**Paragraph 2 criteria:** every component assembly used, with count, name, part
number and revision. Where an assembly was used at more than one revision, list
each revision separately with its own count.

**Paragraph 3 criteria:** the Unit Under Test Datasheet by its section number
within each executed protocol, and the appendix the protocols are attached in.

**Table criteria:** one row per physical unit, identified by serial number or
N/A; systems under test first, then component assemblies grouped by type;
Revision carries the component revision, or N/A for a system whose configuration
is defined by its part number; a prototype or functional equivalent carries an
asterisk on its revision and a footnote paragraph after the GFM table in
\`table\` (not in the three lead-in paragraphs) saying what it was equivalent to.

**Do not** list measurement instruments here — those are Table 2 — and do not
omit the reconciliation between system count and UUT count. Do not list a unit
that was available but not used, or leave a prototype unmarked.

SAMPLE (paragraph 1): Six (6) Solea systems, three (3) TOP-00017 with PCON
systems and three (3) TOP-00051 systems were required to complete testing.
Additionally, given there were multiple Solea Software versions used during the
execution of this protocol, these six (6) Solea Systems made up a total of eight
(8) unique UUT's.

SAMPLE (paragraph 3): More details on the configurations of the units that were
required for testing, including versions for all the major components of the
system, are detailed in the Unit Under Test Datasheet in Section 13.4 of the
executed Solea Model 3 System Design Verification Protocol and section 14.6 of
the Solea Model 3 Hardware Design Verification Protocol, which are attached in
Appendix A of this report.

SAMPLE (footnote): *The adapter was a prototype that was functionally equivalent
to SUB-00450 Rev. 6

## 2.4 TEST EQUIPMENT — 1 sentence + Table 2

targetFields \`narrative\` (the lead-in) and \`table\`.

**Criteria:** one lead-in sentence introducing the table and stating which
executions the equipment list applies to; every row identified by CD asset tag
and, where it has one, serial number; a calibration due date for every
calibrated instrument, and N/A only for instruments that require no calibration.
A single table covers both protocol executions — this report does not produce
one table per execution.

**Do not** include the systems and assemblies under test — those are Table 1 —
or leave a calibration date blank for a calibrated instrument.

SAMPLE: The table below lists all equipment used for testing during the partial
executions of the test protocols.

## 3. FAILURE/OUT OF SPECIFICATION FORMS — lead-in + N entries

targetField \`narrative\`.

**Lead-in criteria:** the number of failures, spelled out and in numerals;
whether the execution was full or partial, with protocol number and revision;
the appendix holding the approved failure forms and where they sit relative to
the completed datasheets; a closing statement that a summary follows. Do not
characterise the failures — the entries do that.

**Each entry** is three blocks:

1. Identifier, two bold lines — \`Failure #NN:\` with the number zero-padded and
   sequential and matching the subsection number, then \`Requirement: <ID>\`.
2. Narrative — the observed shortfall stated plainly, in the present tense where
   it describes a standing product limitation; the technical cause, naming the
   hardware or software element responsible; any field deviation, change record
   or driver update that bears on it; where the failure arises from a test case
   error rather than a product fault, when and why the test case was changed;
   and what the product does do as against what the test case expected.
3. Disposition — whether immediate action is needed; where it is not, why,
   typically that the product contains the expected behaviour and the fault lies
   in the requirement or test case; every document that will be corrected, by
   number; and when, at least to the granularity of "future revisions".

**Do not** record method deviations here, and never close an entry without a
disposition.

SAMPLE (lead-in): There was one (1) failure encountered throughout the partial
execution of the test protocol, 825-00024 Rev. G. The approved failure form is
attached in Appendix A of this report, following all completed datasheets. A
summary of the failure is listed below.

SAMPLE (identifier): Failure #01: / Requirement: M3-SYS-SW-007

SAMPLE (disposition): The software contains the expected behavior, so there is
no immediate action needed. The requirement and test case will be clarified and
edited accordingly in future revisions of the requirements (822-00004) and test
protocol (825-00024) documents.

## 4.1 DATA COLLECTION FORMS — 1 paragraph

targetField \`narrative\`.

**Criteria:** that all completed data collection forms are attached, and the
appendix; which protocol each set of datasheets belongs to, by number and
revision; any supplemental test case created and executed alongside the
protocol, and the report or observation that prompted it.

**Do not** give the supplemental test's results here — those belong at 4.3.

SAMPLE: All completed data collection forms are attached in Appendix A of this
report. This includes datasheets specific to the Solea Model 3 System Design
Verification Test protocol (825-00024, Rev. G) and the Solea Model 3 Hardware
Design Verification Test Protocol (825-0025, Rev. F), respectively. A
supplemental test case was also created and executed as part of this partial
execution of the system protocol, to satisfy an observation documented in the
825-00099R Solea Model 3 Perioguide Pattern Verification Test Report.

## 4.2 REQUIREMENTS VERIFIED — lead-in + Table 3 + Table 4

targetFields \`narrative\` (lead-in only), \`hardwareTable\`, \`systemTable\`.

**Lead-in criteria:** that all requirements detailed in the test plan were
verified during the executions, naming the test plan with number and revision
and each protocol with number and revision, and directing the reader to the
tables that follow.

**Do not** claim that all requirements in the requirements document were
verified — the scope is the test plan. **Do not** put a table footnote in the
lead-in. A qualified-verdict footnote is a paragraph after the GFM table in
\`hardwareTable\` or \`systemTable\`.

Table schemas and cell rules are given under "Fixed table schemas" above.
Caption each table "Table n. <discipline> Requirement Results per Test Plan
<number> Rev. <letter>", hardware first.

SAMPLE (lead-in): All requirements detailed in the Solea M3 Perioguide System &
Hardware Test Plan (825-00104 Rev. B) were verified during the partial
executions of test protocols 825-00024 Rev. G and 825-00025 Rev F, respectively.
See the tables below for a summary of results.

## 4.3 OBSERVATIONS — 1 paragraph per observation

targetField \`narrative\`.

**Criteria:** one observation per paragraph, in the order they arose; when the
observation was made — before testing started, or during execution; the design
review, change record or deviation that authorised any change to scope, method
or configuration; for a requirement found not applicable, the engineering
justification with the supporting analysis or ad-hoc measurement and the
deviation that records it; for a component, software or firmware revision that
changed during testing, what changed, why, and an explicit statement of whether
the revisions are functionally equivalent for the results being relied on; for a
supplemental test, what prompted it, the acceptance criteria and their source,
and the result; where a requirement was satisfied by another report, that report
with number and revision.

**Do not** record a failure here — a failure has its own numbered entry at
section 3 — and do not rely on an earlier revision's results without stating why
the revisions are equivalent.

SAMPLE: Prior to the start of testing, it was determined that the Perioguide
Feature on TOP-00017 systems with an LCD-2 laser controller was not applicable,
as this particular configuration was out of scope of the Perioguide project.
Refer to 824-00228 for further details regarding this scope change. As a result,
the Perioguide Feature will only be released for TOP-00017 systems with a PCON
laser controller as well as on TOP-00051 system configurations. …

## 5. PROBLEM OR FAILURE RESOLUTION — 1 paragraph

targetField \`narrative\`.

**Criteria:** how many failures were reported and which forms capture them; for
each, what was recorded as a failure and why, with the technical cause; where
the failure turns on how the requirement is worded, what the requirement
actually requires; an explicit statement of whether the shortfall is a product
limitation or an error in the test case, and the protocol revision that
introduced the test case; a closing statement of whether immediate action was
required. A single paragraph covering every failure, not one per failure.

**Do not** introduce a cause or conclusion not already stated in section 3 —
this section restates and resolves, it does not report new facts.

SAMPLE (no failures variant, one sentence): No failures or out-of-specification
results occurred during the executions.

## 6. CONCLUSION — 1 paragraph

targetField \`narrative\`.

**Criteria:** the protocols executed, with number and revision, and whether the
executions were full or partial; every assembly verified, by name, and the
product it is being released on; the test plan all testing was performed
against, with number and revision; how many failures were observed and whether
any required immediate action, with the one-line reason; a closing acceptability
statement in the form "<feature or assembly> has been deemed acceptable for
release on <product>".

**Do not** introduce any fact or judgement not already established earlier, and
do not name assemblies differently from how PURPOSE names them.

SAMPLE: This report summarizes the results from the partial executions of the
Solea Model 3 System and Hardware Design Verification Test Protocols (825-00024,
Rev. G and 825-00025, Rev F), respectively, which verified the Solea Model 3
Perioguide Handpiece, Perioguide Tip, Perioguide Sensor Module, Perioguide
Acquisition Module and Perioguide Handpiece Adapter for release on the Solea
Model 3. All testing was performed per the Solea Model 3 SW 4.8.0 Perioguide
System and Hardware test plan (825-00104 Rev. B). One failure was observed but
did not require immediate action. … Based on the justification and rationale of
the results detailed in this report, the Solea Model 3 Perioguide Feature has
been deemed acceptable for release on the Solea Model 3.

## REVISION HISTORY — Table 5 only

targetField \`table\`. No body paragraphs.

**Criteria:** one row per revision of the report, oldest at the top; sequential
revision letters starting at A; the release date of each revision; the change
order releasing it, which must match the ECO/DCO# in the report identity block;
a description saying what the revision does — for a first release, what the
report summarises and what release it supports; authors as first initial and
surname, separated by a slash where there is more than one.

**Do not** edit or remove a historical row, or let the change order differ from
the one in the identity block.

SAMPLE row: A | 31-Oct-2024 | DCO-02058 | Initial release to summarize
verification activities to support the release of the Solea Perioguide Feature
on the Solea Model 3. | W. Harrington / D. Burke`;

/**
 * Chat drafting rules from the Mechanical DV Report Recipe, derived from
 * 825-00101 Rev. A against Verification Test Report Template 731-00008 Rev. B.
 * SAMPLE text is the source report's own wording — copy sentence shape, tense,
 * labels and density; substitute facts from retrieved evidence.
 */
export const MECHANICAL_RECIPE_DRAFTING_GUIDANCE = `${TABLE_FORMATS}

${HOW_TO_USE}

${REPORT_SHAPE}

${VERBOSITY}

${OMIT_IF}

${CHAT_REPLY}

${SECTIONS}`;
