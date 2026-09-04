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
 * Chat drafting rules from the Convergent software DV report recipe.
 * Black recipe text = required shape. Blue recipe text = SAMPLE style
 * (usually a subset of a real report). Copy sentence shape, tense, labels,
 * and density; substitute facts from retrieved evidence.
 */
export const CONVERGENT_RECIPE_DRAFTING_GUIDANCE = `${dvFixedTableFormatGuidance({
  surface: "chat",
  sections: CONVERGENT_DV_TABLE_SECTIONS,
  labels: CONVERGENT_DV_SECTION_LABELS,
})}

## How to draft this report

- Structure is required: heading labels, paragraph order, omit-if, and
  full-vs-partial switches. Do not skip a labelled slot that evidence supports.
- Verbosity is relative, not a word count. Match SAMPLE density: a thin slot
  stays one short sentence; a packed paragraph stacks facts without padding;
  a walkthrough covers every evidenced round. Do not pad or truncate to hit
  a number.
- SAMPLE inventory is not a quota. Count executions, testers, modifications,
  UUTs, equipment rows, deviations, results rows, and regression rounds from
  evidence. Do not invent extras to look like the SAMPLE.
- Software version numbers (scheme \`mm.nn.ff.bb\`, e.g. 4.7.1.1011) belong
  in the drafted text wherever a version is required — Purpose, Scope
  table, deviations, problem resolution, conclusion. Use evidenced versions.
  Do not omit them.
- Do not copy sample names, dates, versions, requirement IDs, JIRA tickets,
  asset tags, or addresses unless they appear in the attachments.
- If a fact is missing, use a bracketed placeholder. Do not invent or pad.
- Engineer-facing replies and reasoning never mention these drafting rules,
  SAMPLE, omit-if switches, targetField names, or tool names. Summarize the
  document sections you wrote. Never call this a recipe.

## Verbosity (relative)

- Thin (one short sentence): Executed Protocol; Data Collection Forms; empty
  Observations; Equipment lead-in.
- Packed (one dense paragraph, facts stacked): Purpose 1 (and 2 if present);
  Scope 1–2; Testers names/dates; UUTs; full-execution Requirements Verified.
- Four-part deviation entries: Observation shorter than Analysis; Resolution
  similar length to Analysis.
- Walkthrough (chronological, as long as the evidence): Problem Resolution;
  Conclusion when that execution had failures or regressions.

## Omit-if / full vs partial (required switch)

- Purpose paragraph 2: omit when this report is a single full execution;
  include when this revision is partial and prior full results are carried.
- Testers signature paragraph: omit unless someone other than the tester signed.
- Protocol Modifications: full = count (words and numerals) + characterisation
  + next-protocol-release sentence; partial = two short lists (added IDs,
  modified IDs).
- Requirements Verified: full = one packed coverage paragraph (no results-matrix
  rows); partial = heading only in Discussion, matrix in the table field.
- Problem Resolution: if no failures, short notes on each deviation and why it
  did not affect formal execution — do not invent regression rounds.
- Conclusion: one paragraph per execution; packed-short if no failures,
  walkthrough if regressions.

## Chat reply (required)

After calling draft_field / edit_table, the chat message is one or two short
status sentences. Do not paste drafted section text into the chat.
Naming the software version (\`mm.nn.ff.bb\`) in that status line is fine.
Do not paste the major/minor/fix/build scheme lecture into the chat —
that primer is required inside Purpose paragraphs 3–4.

## Report shape (required)

Real Convergent software DV reports are organized by **execution block**. Oldest
test-plan revision first, most recent last. Open each block with a bold
sub-heading:

- First block: \`Testing per <test plan number> Rev. <letter>:\`
- Later blocks: \`Rev <letter> of Test Report (Testing per <test plan number> Rev. <letter>)\`

## Purpose — 4 paragraphs (omit paragraph 2 if a single full execution)

targetField \`narrative\`.

**Section criteria:** state the purpose of the report; which protocol revision
was executed; full vs partial for every report; if only one full execution,
omit paragraph 2; if multiple execution versions, give the rationale for
documenting each; describe the software version-control scheme as a bulleted
list (major, minor, fix, build); explain what a build number is.

**Do not** put the scheme lecture (what major/minor/fix/build mean) in
paragraphs 1–2 or in any other section. Paragraphs 1–2 still name the
software version number itself.

**Verbosity:** paragraphs 1–2 packed (one dense sentence each). Paragraphs 3–4
are fixed boilerplate, not evidence-derived.

1. Packed. Purpose of this revision; protocol number + revision; full or
   partial execution; software application, version (\`mm.nn.ff.bb\`),
   controlled document number + revision, release type; what the build was
   for (patch, bug fixes, new feature). Name the version. No configurations,
   requirements, deviations, results, or scheme lecture.
   SAMPLE: The purpose of this revision of this report is to present the testing
   results obtained following the partial execution of the Solea Model 3 Software
   Design Verification Protocol (790-00134 Rev. R), which is used to test the
   Solea Software Application 4.7.1.1011 (CUS-01188 Rev T), for Full Market
   Release. This build was designed as a patch to fix multiple bugs.
2. Packed. **Omit entirely** when this report documents a single full
   execution. If partial: because not all requirements were tested, the report
   also carries the most recent full execution — name that report revision and
   the software version it covered. Do not summarise findings.
   SAMPLE: Due to the fact that not all requirements were tested during this
   partial execution of the test protocol, this test report contains the results
   from the most recent full execution of the test protocol (documented in Rev. T
   of this test report) for the release of Solea Software Application version,
   4.7.0.
3. Lead-in + bulleted VCS list only. Scheme is \`mm.nn.ff.bb\` (major, minor,
   fix, build). This is the only place the major/minor/fix/build description
   may appear.
   SAMPLE: Note that Convergent Dental's software version control system (VCS)
   has four components that uniquely identify the release:
   mm.nn.ff.bb, where:
   - mm: represents major release number (01, 02, etc.)
   - nn: represents minor release number (01, 02, etc.)
   - ff: represents fix release number (01, 02, etc.)
   - bb: represents build number (01, 02, etc.)
4. Build number. Internal identifier; may be omitted from the customer-facing
   version; the fix number then defines the release. One major/minor/fix
   combination per release.
   SAMPLE: The build number is considered an internal identifier and may not be
   displayed to the customer. In cases where the build number is omitted, the
   fix release number defines the release. There is only one combination of
   major, minor, and fix number for each release.

## Scope — 2 packed paragraphs + 1 table

targetField \`narrative\` (prose AND the Software Under Test table).

**Section criteria:** which product applies; how configurations are tracked;
what makes each configuration different; where requirements are documented;
whether testing ran on all configurations.

**Verbosity:** two packed paragraphs, then the table. Table cell prose may be
longer than the paragraphs; each build still gets one differentiated reason.

1. Packed. Product; configuration tracking (TOP / CUS / SUB IDs); what
   differs (laser controller); requirements document number + revision; test
   plan revision executed.
   SAMPLE: This test report applies to Solea Model 3 and is used as a
   verification activity for system configurations defined as TOP-00017 and
   TOP-00051. This includes TOP-00017 system configurations with either
   CUS-01209 (LCD-2) or SUB-00302 (PCON) laser controllers. The scope of the
   requirements tested per the full execution of the protocol presented in this
   report are detailed in the Solea Model 3 Software Requirements Document
   (822-00007, Rev. V) and were executed per the test plan 790-00155 Rev. X.
2. Packed. Whether testing ran on all configurations. Three reasons a
   requirement might not be repeated on every platform: no hardware dependency,
   identical hardware, or applies to one platform only. If partial, name the
   last full execution and subsequent partial executions by test-plan revision.
   SAMPLE: Testing was executed on both TOP-00017 and TOP-00051 system
   configurations. This includes TOP-00017 systems with an LCD-2 laser
   controller installed, TOP-00017 systems with a PCON laser controller
   installed, and TOP-00051 systems with a PCON laser controller installed.
   Some of the requirements do not need to be tested on multiple platforms due
   to three different possible reasons: There is no hardware dependency, the
   hardware dependent is identical on all platforms, or the requirement only
   applies to one platform. As this is a partial execution, this report also
   includes the results from the last full execution (executed per test plan
   790-00155 Rev. W) and the subsequent partial executions (executed per the
   test plan 790-00155 Rev. X).

Then a 2-column table captioned \`Table 1: Software Under Test\`. Segregate by
test-plan revision (oldest first). Each software version has a differentiated
reason for build. Do not put the Requirements Verified matrix here.

SAMPLE shape (substitute evidence; keep separator rows):

| Solea Model 3.0 SW Application Version | Reason for Build |
| --- | --- |
| Testing per 790-00155 Rev. W |  |
| 4.7.0.982 | Original software build for the full execution of the Solea Model 3 Software Verification Protocol (790-00134, Rev. Q), executed on both TOP-00017 (with LCD-2 and PCON laser controllers installed) and TOP-00051 systems. The associated datasheets are attached in Appendix A of this report. |
| 4.7.0.996 | Software build generated for regression testing due to failures found during the initial execution. |
| Testing per 790-00155 Rev. X |  |
| 4.7.1.1011 | Original software build for the partial execution of the Solea Model 3 Software Verification Protocol (790-00134, Rev. R), executed on both TOP-00017 and TOP-00051 systems. The associated datasheets are attached in Appendix D of this report. |

## Testers/Dates — one block per execution

targetField \`testers\`. Dates belong in this narrative. There are no separate start/end date fields.

**Section criteria:** one block per test-report revision, labelled with the test
plan it reports on; oldest execution first; every tester in full with job title
and company relationship (employee, intern, contractor); calendar start and end
dates; if a datasheet was signed by someone other than the tester, who and why.

**Verbosity:** heading is a label; names/dates sentence is packed; signature
paragraph (if present) is a short explanation, not a biography.

Per execution block:
1. Bold sub-heading: \`Testing per <test plan> Rev. <letter>:\`
   SAMPLE: **Testing per 790-00155 Rev. W:**
2. Packed. Every tester, role, affiliation, start and end dates.
   SAMPLE: All testing was performed by Convergent Dental Test Engineers Dylan
   Burke and Wesley Harrington as well as Convergent Dental interns Benjamin
   Kamis and Christopher Lam between 15 June 2023 and 19 July 2023.
3. **Omit** if every tester signed their own datasheets. If someone else
   signed: why, who signed, and that person's title.
   SAMPLE: Benjamin Kamis and Christopher Lam were no longer with the company
   once testing was completed. As a result, although they completed the tests,
   they were not able to sign the datasheets before their departure. The
   datasheets were instead signed by their supervisor, Jai Paul – Director of
   Quality Assurance and Regulatory Affairs.
4. Next execution: bold sub-heading
   \`Rev <letter> of Test Report (Testing per <test plan> Rev. <letter>)\`
   then the tester/date sentence.
   SAMPLE heading: **Rev U of Test Report (Testing per 790-00155 Rev. X)**
   SAMPLE body: All testing was performed by Convergent Dental Test Engineers
   Rachel Scaer, Wesley Harrington, and Dylan Burke between 16 FEB 2024 and
   20 FEB 2024.

## Methods of Measurement — one block per execution; do **not** put the equipment table here

targetField \`narrative\`. In the Word template Test Equipment is a subsection of
Methods; in this editor it is its own section. Leave the table out of Methods.

**Section criteria:** one block per test-plan revision; same labelled
sub-sections in order: Executed Protocol, Protocol Modifications, Units Under
Test (UUTs). Executed Protocol is full vs partial plus protocol number and
revision. Protocol Modifications accounts for every change and where it will be
formalised. UUTs cross-reference the UUT Data Sheet and reconcile systems vs
UUTs.

Per execution block:
1. Bold sub-heading: \`Testing per <test plan> Rev. <letter>:\`
2. **Executed Protocol:** thin. Full or partial execution of
   \`<protocol> Rev. <letter>\`. No supporting detail (that belongs in Scope).
   SAMPLE: **Full execution of 790-00134 Rev. Q.**
   SAMPLE (partial): **Partial execution of 790-00134, Rev. R.**
3. **Protocol Modifications:**
   - Full execution: packed. Count spelled out and in numerals (from evidence,
     not from SAMPLE), protocol cited, what changed (typos, nomenclature,
     methods no longer applicable), and that changes go into the next protocol
     release.
     SAMPLE: There were twenty-two (22) modifications found during the
     execution of the Solea Model 3 Software Design Verification Protocol
     (790-00134 Rev. Q). These modifications fix typos, address nomenclature
     changes or out of date methods that are no longer applicable to test the
     methods. All modifications will be implemented into the next release of
     the software verification protocol.
   - Partial execution: two short sentences listing test cases added and test
     cases modified (requirement IDs).
     SAMPLE: The following test cases were added to the protocol: SW-WLP-24.1
     Pulse Widths, SW-SST-6.4 White Box, SW-WLP-5, SW-EH-1.2, SW-IN-2
     SAMPLE: The following test cases were modified in this protocol: SW-IN-1,
     SW-IN-1.1, SW-LCB-1, SW-LWB-4, SW-IN-2, SW-SDT-1, SW-SST-5.1.1, SW-SIB-3,
     SW-SS-4
4. **Units Under Test (UUTs):** packed. Point to the UUT Data Sheet by
   section number in the executed protocol and the appendix it is attached in.
   State system count (spelled out + numerals), breakdown by configuration and
   laser controller, and how many distinct UUTs those systems represented.
   SAMPLE: The units under test (UUTs), including the versions for all major
   components of the system required for testing, that were used for the
   execution of the test protocol are detailed in the Unit(s) Under Test (UUTs)
   Data Sheet in Section 13.3 of the executed protocol, which is attached in
   Appendix A of this report. Four (4) Solea Model 3 systems were used to
   complete all testing. Two (2) TOP-00017 systems and two (2) TOP-00051
   systems were utilized. One (1) of the TOP-00017 systems had a CUS-01209
   (LCD-2) laser controller installed. The second TOP-00017 system had a
   SUB-00302 (PCON) laser controller installed. These systems were configured
   such that the represented twelve (12) different UUTs.

## Test Equipment — lead-in + table per execution

targetField \`table\`. Exception to the usual "table only" rule: a one-line
lead-in is required before each table.

Lead-in (thin), starting: "The table below lists all equipment used for
testing during the [full/partial] execution of the test protocol."
SAMPLE: The table below lists all equipment used for testing during the full
execution of the test protocol.

Caption like \`Table 2. Test Equipment (Applicable to <test plan> Rev. <letter>)\`.
Then ONE GFM table per execution with headers exactly:

| ${EQUIPMENT_HEADER_LINE} |
| --- | --- | --- | --- | --- |

Systems under test first, then measurement instruments. Every row needs a CD
asset tag and/or serial number. Calibration Due is month-and-year for
instruments and N/A for systems under test. Row count follows evidence.

SAMPLE rows (systems then instruments):

| ${EQUIPMENT_HEADER_LINE} |
| --- | --- | --- | --- | --- |
| Solea Model 3 System | Convergent Dental | Model 3 / TOP-00017 | 0300110 | N/A |
| Timer | Thomas Scientific | 1235256 | CD-0979 | Sept-2023 |
| Oscilloscope | Rigol | MSO1104Z | CD-0603 / S/N: DS1ZD192900671 | May 2024 |

## Deviations — one block per execution; numbered 4-paragraph entries

targetField \`narrative\`.

**Section criteria:** one block per test-plan revision; lead-in with count and
appendix; numbering restarts each block (#01, #02); every deviation names the
requirement ID(s); same four-paragraph shape; every corrective action or
deferral cites a JIRA ticket; observation and analysis stay in separate
paragraphs.

**Verbosity:** lead-in is packed (count from evidence). Observation is the
shortest of the four parts (what was seen only). Analysis is longer
(cause + which artefact is wrong). Resolution is similar length to Analysis.

Per block:
1. Bold sub-heading naming the test-plan revision.
   SAMPLE: **Testing per 790-00155 Rev. W:**
2. Packed lead-in: count spelled out and in numerals; full or partial;
   protocol number + revision; appendix holding approved deviation forms
   (relative to completed datasheets). If there were none, say so in one
   sentence — do not invent deviations.
   SAMPLE: There were eleven (11) deviations encountered throughout the full
   execution of the test protocol, 790-00134 Rev. Q. All approved deviation
   forms are attached in Appendix A of this report, following all completed
   datasheets for both executions.

Each deviation (repeat for every evidenced deviation):
1. Bold identifier, two lines: \`Deviation #01:\` then \`Requirement(s): <IDs>\`.
   Use "Requirement:" for one ID and "Requirements:" for more than one.
   SAMPLE: **Deviation #01:**
   **Requirements: SW-WVI-1.2**
2. Observation (past tense): what was seen only — quotes, error codes, version
   numbers. No cause or fix.
   SAMPLE: The listed address for the company in the About section of the
   software version under test (4.7.0.982) was “140 Kendrick Street, Bldg C3
   Needham, MA 02494”
3. Analysis: why it occurred; software vs requirement/test-case at fault;
   documents that will change.
   SAMPLE: Convergent Dental, Inc was previously located at 140 Kendrick
   Street, Bldg C3 Needham, MA 02494. However, the company just recently
   completed an office relocation effort and the address changed accordingly.
   The new (and current) address of the company is 100 Fifth Ave, Suite 1010,
   Waltham, MA 02451. This was unintentionally not updated in the software
   version under test (4.7.0.982) and expected results of the test case.
4. Resolution: corrected in a named software version and confirmed in a named
   regression round, **or** "No immediate action is required" plus the document
   that will be updated. Close with the JIRA ticket.
   SAMPLE (corrected): This issue was corrected and implemented into an updated
   software version that was confirmed as part of the first round of regression
   testing using software version 4.7.0.996. The CD address was updated in the
   software resources file. Tracked in JIRA PS-2168.
   SAMPLE (deferred): No immediate action is required. The Error log
   information is still available in both the compressed zip file and on the
   Convergent Log Server. This requirement will be reviewed prior to the next
   version of the requirements document (822-00007). Tracked in JIRA PS-2169.

## Results and Discussion — TWO draft_field calls

**Discussion** (targetField \`narrative\`) — prose only, no markdown table:

**Section criteria:** one block per test-plan revision; same three sub-sections
in order: Data Collection Forms, Requirements Verified, Observations. Data
Collection Forms is one sentence pointing at the appendix. Requirements
Verified is a narrative for a full execution and a table for a partial
execution. Observations records everything noticed outside the deviations;
each states whether it failed a requirement and how it was dispositioned. If
nothing was observed, one sentence says so.

Per execution block:
1. Bold sub-heading naming the test-plan revision.
2. **Data Collection Forms:** thin. One sentence naming the appendix.
   SAMPLE: **All completed data collection forms are attached in Appendix A of this report.**
3. **Requirements Verified:**
   - Full execution: packed. All requirements in the named requirements
     document were verified during the full execution of the named protocol.
     Point to the appendix with the executed protocol.
     SAMPLE: All requirements detailed in the Solea Model 3 Software
     Requirements Document (822-00007, Rev. U) were verified during the full
     execution of test protocol 790-00134 Rev. Q. Refer to Appendix A of this
     report for the executed test protocol with all testing results.
   - Partial execution: heading only in Discussion — the matrix goes in \`table\`.
4. **Observations:** one observation per paragraph (stage noticed, whether it
   failed a requirement, disposition / software version). If none: one thin
   sentence, "No additional observations were made outside the scope of the
   protocol."
   SAMPLE (none): **No additional observations were made outside the scope of the protocol.**

**Results matrix** (targetField \`table\`) — ONE GFM table, headers exactly:

| ${RESULTS_HEADER_LINE} |
| --- | --- | --- | --- |

Use this table for a **partial** execution (one row per requirement tested in
evidence). For a full execution whose coverage is the narrative statement
above, leave the seeded header row and do not invent extra rows.

- Req. Description quotes requirement text verbatim, including applicability notes.
- Satisfied by names the configuration datasheets and the appendix
  (example: \`TOP-00017 PCON datasheets (See Appendix B)\`).
- P/F is per configuration, not a bare Pass/Fail:
  \`P for TOP-00017 PCON\` or
  \`P for TOP-00051, TOP-00017 PCON and TOP-00017 LCD-2\`.
- Requirements run on more than one configuration list every configuration in
  both Satisfied by and P/F. Keep one row per Req. ID.
- Preserve dotted suffixes (\`SW-SST-5.1.1\` is not \`SW-SST-5\`).

SAMPLE rows (partial execution; one row per Req. ID):

| ${RESULTS_HEADER_LINE} |
| --- | --- | --- | --- |
| SW-IN-1 | The software shall support upgrades via installation. | TOP-00017 PCON datasheets (See Appendix B) | P for TOP-00017 PCON |
| SW-SST-5.1.1 | If the foot pedal position was nonzero when entering Laser Armed state the software shall not allow transition to Laser Cutting state until the foot pedal position has returned to zero position followed by a nonzero foot pedal position. | TOP-00017 PCON datasheets (See Appendix B) | P for TOP-00017 PCON |
| SW-PA-1 | The software shall use the patterns as specified in the Solea Model 3 Parameters Calculator (721-00120). | TOP-00017 PCON, TOP-00017 LCD-2 and TOP-00051 datasheets (See Appendix B) | P for TOP-00051, TOP-00017 PCON and TOP-00017 LCD-2 |

## Problem or Failure Resolution — one block per execution, summarise the arc

targetField \`narrative\`. This section is the story of regression rounds;
Deviations is the record. Do not duplicate deviation detail.

**Section criteria:** one block per test-plan revision; narrate how every
failure was resolved in regression-round order; name each software build and
the configurations retested; state each round's result; end with the final
software version.

**Verbosity:** walkthrough. Initial execution is one packed paragraph of the
arc (not a reprint of each deviation). Later rounds stay in chronological
order — one beat per evidenced round. Length follows how many rounds evidence
supports.

Per block:
1. Bold sub-heading.
   SAMPLE: **Testing per 790-00155 Rev. W:**
2. Initial execution (walkthrough start): software version, configurations, how
   many tests failed and how many deviations (spelled out + numerals, from
   evidence), immediate vs deferred, the build produced, configurations
   retested, outcome.
   SAMPLE: During the initial full execution of the test protocol which tested
   the Solea Software Application version 4.7.0.982 on both the TOP-00017 and
   TOP-00051 systems, there were several tests that failed to satisfy their
   requirement(s) under test, which resulted in eleven (11) deviations related
   to software requirements. All the issues are detailed in the respective
   deviations. Several of the deviations did not require immediate action and
   will be addressed in the subsequent version of the requirements documents
   and test protocol. All other deviations required immediate action to address
   the issues, so a new version of software was generated to address these
   failures, and a round of regression testing was performed with software
   version 4.7.0.996 (on TOP-00017 system configurations with LCD-2 and PCON
   laser controllers respectively, and the TOP-00051 system configuration).
   All of the retested test cases were verified to have been fixed and resulted
   in a Pass.
3. Later rounds: each subsequent round in order — what prompted it, whether it
   failed a requirement, build, configurations, result, why a round was limited
   to one configuration, supplemental test cases. End with the final software
   version.

If a partial execution had no failures: two short paragraphs stating each
deviation and why it did not affect formal execution. Do not invent a
regression history.
SAMPLE: During the partial execution of the test protocol, which tested
requirements on version 4.7.1.1011, two deviations were observed. The first was
a mismatch between the number of points for an ultraguide pattern between the
Pattern Calculator Data Sheet and the system’s database. As ultraguide is not
implemented on Model 3 that did not effect formal execution.

## Conclusion — one paragraph per execution, no bullets

targetField \`narrative\`.

**Section criteria:** one block per test-plan revision, most recent last; each
block is a single paragraph; open with report revision, protocol number and
revision, full vs partial; list configurations and software version; summarise
failures and correcting builds in order; close with "… has been deemed
acceptable for release" naming the final version. Make no claim that Results
and Discussion / Problem or Failure Resolution do not already support.

Per block: bold sub-heading, then one paragraph.
- Full execution with regressions: walkthrough of the same build history
  already supported above; close with the acceptability sentence.
  SAMPLE close: Based on the justification and rationale of the results
  detailed in this report, Solea Model 3 Software Application version 4.7.0.999
  has been deemed acceptable for release.
- Partial with no failures: packed-short. State that plainly and go to the
  acceptability sentence.
  SAMPLE: Revision U of this report contains the results from the test protocol
  (790-00134 Rev. R) that was partially executed on TOP-00017 PCON, TOP-00017
  LCD-2, and TOP-00051 systems to test the Solea Model 3 Software application
  version 4.7.1.1011. No failures were found. Based on the justification and
  rationale of the results detailed in this report, Solea Model 3 Software
  Application version 4.7.1.1011 has been deemed acceptable for release.
`;
