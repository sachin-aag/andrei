import type { DocumentChatDraftingGuidance } from "@/lib/document-types/types";

const QSR_RTM_GUIDANCE = `Requirement Traceability Matrix (5.1–5.6): one row per URS ID from the approved URS. Copy the URS ID and requirement text word for word, including ranges and units (−15–130 °C, −50 ± 10 RPM, Full Vacuum to 3.5, NLT 8800 L). Keep a leading minus on a negative temperature or RPM — do not write 15 °C when the URS shows −15 °C, and do not write 50±10 or an approximate sign when the URS shows −50 ± 10 RPM. Cover-page URS identity (capacity, MOC, equipment ID) may be copied onto the matching row — it does not have to sit beside that URS-N on the same page. Never merge two requirements into one row, never renumber, and never paraphrase a missing ID — omit the row. Put each URS under the table that matches its URS heading: process → 5.1 Process Requirements, control → 5.2 Control Philosophy, GMP → 5.3 GMP Requirements, safety → 5.4 Safety Requirements, CSV → 5.5 Computer System Validation, maintenance → 5.6 Maintenance and Cleaning. Keep each safety ID paired with that ID's own text (do not shift IDs down one row). Rows under OTHER AUXILIARY REQUIREMENT must come from the URS auxiliary section — do not invent equipment or materials the URS does not list. Reference – Qualification Stage is DQ/IQ/OQ/PQ and Reference – Section is the protocol section that actually tested that row's Parameters. Search the attached Design / Installation / Operational / Performance Qualification PDFs for each URS row (grep that parameter — jacket, agitator, nozzle — not a canned mapping). Fill Stage / Section / Remarks only from a cited protocol body that names that URS ID or that describes that parameter in a spec or verification table. Ignore the running header that repeats Capacity/Size on every page. When more than one of DQ / IQ / OQ / PQ matches that row, write the highest family only (PQ, then OQ, then IQ, then DQ) — one Stage cell, not DQ / IQ. If that parameter is not in the protocol body, leave those three cells empty for that row — still persist the URS ID, Parameters, and User requirements. Never write Complies, bare Section 13, or a stock IQ page on every row. Verified on the result line may be copied as Complies; a Verified By signature block is not a pass. Empty Stage / Section / Remarks the engineer asked to fill are a gap — call edit_table for the cells the pages support; do not paste a protocol-to-URS mapping in chat and wait for confirmation. 5.1 is seeded with URS-1 plus merged group rows ANY SPECIFIC REQUIREMENTS and OTHER AUXILIARY REQUIREMENT — keep those banners and do not add new group rows. A URS page often prints every ID and parameter first, then the requirement sentences in the next column: copy each sentence onto that ID in one insert_rows (every ID from the pages you read, User requirements included). Prefer afterRowKey (URS-16 or the banner label) over afterRow so inserts stay next to the intended row. Prefer edit_cells rowKey (URS-13) over numeric row so a targeted cell edit still lands after banners or earlier inserts. Give every cell its own rowKey; do not reuse one dummy row number for every URS.

Editing RTM rows in chat:
- Never copy a neighbour URS-ID window onto another row (do not copy URS-37's range onto URS-5). Facts on the URS cover or outside any URS-ID window (capacity, MOC) may be copied onto the matching row.
- Call list_attachments and search the attached DQ / IQ / OQ / PQ PDFs in the same turn as the URS rows, grepping each row's Parameters.
- When they asked to fill empty cells, read_section first, identify the empty cells, and edit only those — do not rewrite a filled cell in the same batch, including a filled Reference – Section. If you do change a filled Section, still write the highest family only.
- Never write \`<remarks>\`, \`<qualification stage>\`, or \`<section>\` as RTM cell text. If a tool returns those leftovers, search the IQ / OQ / PQ / DQ protocol bodies for that row's Parameters before calling edit_table again. Do not list Proposed Updates that still show them.`;

export const QSR_DRAFTING_GUIDANCE: DocumentChatDraftingGuidance = {
  always: `QUALIFICATION SUMMARY REPORT (3xper QAD/016/F06-00) — DRAFTING RULES

One report summarises the full qualification lifecycle (URS, DS, FMEA, DQ, FAT, SAT, IQ, OQ, PQ) of one main equipment/system and its auxiliaries. Write in past tense, formal GMP register, 3xper Innoventure Limited, Naidupeta as the site.

Standard wording (replace <equipment> with the equipment number from the header identity, e.g. GLR-1301):
- Objective: "The objective of this Qualification Summary Report is to provide a consolidated summary of all qualification activities performed for the <equipment> and connected auxiliary equipment, including the review of qualification documents, deviations (if any), and overall compliance with URS, applicable GMP requirements, and company procedures."
- Overview: "The <equipment> along with its ancillary requirements including utility connections is installed and utilized for its intended usage within the 3xper Innoventure Limited, Naidupeta facility. The <equipment> has been designed, installed, and qualified in accordance with approved User Requirement Specifications, engineering standards, GMP requirements, and internal quality procedures. Qualification activities were performed to verify that the equipment/system consistently operates as intended and is capable of supporting the required process and product quality attributes."
- Background: "Qualification of the <equipment> was performed to demonstrate its fitness for intended use. Qualification activities were executed to verify compliance with approved user requirements and to provide assurance that the equipment/system operates safely, reliably, and consistently within its intended operating range."
- Conclusion: "The qualification activities performed demonstrate that the <equipment> along with auxiliary equipment are installed correctly, operates as intended, and performs consistently in accordance with predefined acceptance criteria and User requirement specification. The equipment/system is hereby recommended for release into routine GMP use." Only write the release recommendation when the attached reports show no open deviation; otherwise state what is open.

Keep seeded table header rows and column order exactly as seeded.

Never invent document numbers, revisions, dates, volumes or ranges — copy them from a cited attachment page or leave the cell empty.`,
  bySection: {
    qsr_references:
      "References: fill Reference Number from the attached URS / DS / DQ / IQ / PO documents. Leave blank when not found. Use the revision printed on that document (URS 00, not a neighbouring protocol's 01).",
    qsr_qualification_documents:
      "Qualification Documents (Table 3): start empty. List cited lifecycle documents in this order: URS, DS, FMEA, DQ, FAT, SAT, IQ, OQ, PQ. Omit a type that was not on a cited cover page — do not invent FMEA, FAT, or SAT rows. For DQ / IQ / OQ / PQ, one protocol row then one report row: fill Document Name, Revision, Status, date, and Remarks on the protocol row only; the report row carries Document Number (and Status/date if cited) and leaves Document Name, Revision, and Remarks empty (export merges those cells). Do not insert a second fully filled report row — that looks like a duplicate. Never write Approved / Complies / Closed unless that exact word is on a cited cover page; otherwise leave Status empty. Copy numbers, revisions, and dates from that document's own cover page, not a neighbouring protocol's signature page — do not copy the DQ date or revision onto the URS row.",
    qsr_sops:
      "Standard Operation Procedures: SOP numbers and effective dates for operation & cleaning, calibration, preventive maintenance, and training.",
    qsr_rtm_process: QSR_RTM_GUIDANCE,
    qsr_rtm_control: QSR_RTM_GUIDANCE,
    qsr_rtm_gmp: QSR_RTM_GUIDANCE,
    qsr_rtm_safety: QSR_RTM_GUIDANCE,
    qsr_rtm_csv: QSR_RTM_GUIDANCE,
    qsr_rtm_maintenance: QSR_RTM_GUIDANCE,
    qsr_volumetric_details:
      'Volumetric Details: a paragraph naming each equipment (main equipment first, then "Auxiliary Equipment: <ID>"), each followed by its S.No / Parameter / Details table.',
    qsr_operating_range:
      "Operating Range: the form header is S.No, Parameter, Details (Details spans two columns). Pressure, Vacuum, and Agitator RPM keep that span. Temperature uses two rows — Minimum, then Maximum — under one S.No and Parameter, with the value in Details. Do not add a Range column. Copy numeric ranges from the URS (Full Vacuum to 3.5 kg/cm², −50 ± 10 RPM, −15 °C minimum). Keep the sign on a negative setpoint; do not write 15 when the URS shows −15, and do not write 50±10 or ~50 when the URS shows −50 ± 10 RPM. Do not write VFD compatible in place of an RPM number; leave Details empty when the URS page is not cited.",
    qsr_other_details:
      'Other Details: bold label then value, e.g. "Agitator Type: Cryo-Fix Anchor".',
  },
};

export const QSR_RETRIEVAL_GUIDANCE = {
  adaptive: `- Filling RTM Stage / Section / Remarks: one URS ID is not one grep. The first search_documents queries[] must include Installation Qualification, Operational Qualification, Performance Qualification, and Design Qualification plus that row's Parameters from read_section, not only the URS ID. An IQ protocol hit is not enough while PQ or OQ have not been queried.`,
  comprehensive: `- For Qualification Summary Report Table 3 (Qualification Documents) omit attachmentIds — every attached URS / DS / DQ / IQ / OQ / PQ file is evidence. Table 3 reads cover pages for document number, revision, status, and Protocol No. / Report No.; do not walk every protocol body page.
- For RTM tables and Operating Range, omit attachmentIds — the server keeps the URS (not DQ/IQ/OQ/PQ bodies). A 12-page URS is a 12-page walk.`,
} as const;
