/**
 * Fills the Investigation Report DS template with realistic ERF/26/022 content
 * so the rendered layout can be compared against the source report page by
 * page. Structural assertions in failure-investigation-report.test.ts cannot
 * catch spacing, wrapping or page breaks — this is how you look at those.
 *
 *   node scripts/preview-fir-docx.mjs
 *   soffice --headless --convert-to pdf --outdir /tmp/preview /tmp/preview/fir.docx
 *
 * The generated XML deliberately mirrors what generate-docx.ts emits under
 * MJ_FIR_DOCX_RUN_STYLE — Times New Roman 12pt, justified narrative, grey
 * (D9D9D9) table headers, LEFT-aligned cells, no cell paragraph spacing, and
 * cantSplit/tblHeader row properties. Diverging from the real pipeline here
 * produces a preview that lies: every early mismatch in this file (blue
 * headers, justified cells, double-height rows, orphaned split tables) looked
 * like a product bug and was not.
 */
import fs from "node:fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const TPL = process.argv[2] ?? "templates/mj-failure-investigation-report-template.docx";
const OUT = process.argv[3] ?? "/tmp/preview/fir.docx";

// Mirrors DEFAULT_RUN_FONT / DEFAULT_RUN_SIZE_HALF_POINTS in docx-export-context.ts
const FONT = process.env.RUN_FONT ?? "Times New Roman";
const SZ = process.env.RUN_SZ ?? "24";
const HDR_FILL = process.env.HDR_FILL ?? "D9D9D9";

const esc = (t) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const rPr = (b = false) =>
  `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>${b ? "<w:b/>" : ""}<w:sz w:val="${SZ}"/><w:szCs w:val="${SZ}"/></w:rPr>`;
// MJ_FIR_DOCX_RUN_STYLE: narrative justified, no paragraph spacing. Table cells
// are left-aligned — tableCellToXml defaults cellAlign to "left" regardless of
// ctx.paragraphAlign, so justified cell text would misrepresent the pipeline.
const p = (t, b = false, align = "both") =>
  `<w:p><w:pPr><w:jc w:val="${align}"/></w:pPr><w:r>${rPr(b)}<w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
const para = (...lines) => lines.map((l) => p(l)).join("");

function table(headers, rows) {
  const w = Math.floor(9800 / headers.length);
  const border = (s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
  const borders = `<w:tblBorders>${["top","left","bottom","right","insideH","insideV"].map(border).join("")}</w:tblBorders>`;
  const cell = (t, hdr) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${hdr ? `<w:shd w:val="clear" w:color="auto" w:fill="${HDR_FILL}"/>` : ""}</w:tcPr>${p(t, hdr, "left")}</w:tc>`;
  // narrative-to-docx-xml.ts emits cantSplit on every row and tblHeader on the
  // header row, so split tables repeat their header. Mirror that here.
  const row = (cells, hdr) =>
    `<w:tr><w:trPr><w:cantSplit/>${hdr ? "<w:tblHeader/>" : ""}</w:trPr>${cells.map((c) => cell(c, hdr)).join("")}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}</w:tblPr><w:tblGrid>${headers.map(() => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${row(headers, true)}${rows.map((r) => row(r, false)).join("")}</w:tbl>`;
}

const data = {
  dateOfNonConformance: "22/05/2026",
  sourceDocumentNo: "ERF/26/022",
  documentNo: "ERF/26/022",
  productName: "r-Insulin Glargine",
  batchNo: "RIG25014",
  equipmentId: "L-1901",
  unit: "Drug Substance",
  referenceSopNo: "SOP/QA/017",
  toolsCheckboxes: "☒ 5 Why   ☐ 6M Analysis   ☐ Brainstorming   ☐ Cause and Effect Diagram   ☐ Experimental Studies   ☐ Gemba walks / Genchi Genbutsu   ☐ Flow Chart",
  rootCauseClassificationCheckboxes: "☐ Assignable Cause   ☐ Probable Cause   ☒ Root Cause   ☐ No Root Cause",
  rootCauseGroupCheckboxes: "☐ Man   ☐ Material   ☒ Machine   ☐ Method   ☐ Measurement   ☐ Milieu   ☐ No Root Cause",
  humanErrorCheckboxes: "☐ Applicable   ☒ Not Applicable",
  resultsStatusCheckboxes: "☐ All results final   ☒ Interim — testing still in progress",
  batchDispositionCheckboxes: "☒ Batch Approved   ☐ Batch Rejected   ☐ Batch Returned / Recalled   ☐ Not Applicable",
  eventDescriptionXml: para(
    "On 22/05/2026 during lyophilization (Freeze Drying) step of batch no. RIG25014, the vacuum pressure at the start of the primary drying step 1 was observed to be outside of specified limits between 20:59:11 and 21:06:11 (8 consecutive one-minute readings, 7 minutes elapsed). The lowest recorded vacuum pressure was 192.40 µbar, against the acceptance range of 650 to 950 µbar which is a critical process parameter (CPP).",
    "This observation was reported by Mr. Shrinath Yeotikar during routine batch monitoring."
  ),
  standardProceduresXml: para(
    "The vacuum pressure of lyophilizer (L-1901) shall be maintained within the range of 650 to 950 µbar during the primary drying stage as it is a critical process parameter (CPP) as per approved process control strategy report (GR/25/005 – R00) and the CAPA taken under ERF/25/146 for change in pressure range."
  ) + table(
    ["Step", "Set Point (µBar)", "Controlling Band", "Operating Range"],
    [
      ["Primary Drying – Step 1", "800", "±150", "650 – 950"],
      ["Primary Drying – Step 2", "800", "±150", "650 – 950"],
      ["Primary Drying – Step 3", "600", "±120", "480 – 720"],
      ["Primary Drying – Step 4", "500", "±120", "380 – 620"],
      ["Secondary Drying Step 1", "250", "200 – 600", "200 – 600"],
      ["Secondary Drying Step 2", "250", "200 – 600", "200 – 600"],
    ]
  ),
  immediateActionXml: para(
    "The observation was communicated to the engineering team. The engineering team checked the auto valves (YV-3106, YV-3107, YV-3108) to identify any malfunction; no malfunction of valves was observed. The manual vacuum control needle valve was adjusted to increase the pressure, upon which pressure increased and was maintained within the range, restoring the system parameters within the acceptance range of 650 to 950 µbar."
  ),
  initialImpactXml: para(
    "At the time the event was raised, product, process, equipment and documentation impact were assessed. Shelf and product temperature trends were reviewed and found within established operating ranges. Product impact was held pending completion of finished-product analytical testing."
  ),
  teamTableXml: table(
    ["Name", "Department (Role/Responsibility)"],
    [
      ["Sachin Kumbhar", "Engineering – Team Lead"],
      ["Gaurav Shelar", "Engineering – Team Member"],
      ["Harshdeep Thakkar", "Production – Team Member"],
      ["Akash Kengar", "Quality Assurance – Team Member"],
    ]
  ),
  toolsNarrativeXml: para("Documents review was also performed alongside the Why-Why analysis."),
  chronologyNarrativeXml: para("The sequence of events during the lyophilization cycle is tabulated below."),
  chronologyTableXml: table(
    ["Activity / Step", "Observation / Details"],
    [
      ["Lyophilization cycle initiation", "Lyophilization cycle for batch no. RIG25014 was initiated at 14:16 hrs as per defined process parameters."],
      ["Primary Drying Step 1 initiation", "Step 1 was initiated at 20:58 hrs with set temperature -45°C, ramp duration of 2 minutes, soak duration of 60 minutes and chamber pressure of 800 µbar."],
      ["Observation during Primary Drying Step 1", "Between 20:59:11 and 21:06:11 the chamber vacuum was observed below the lower acceptance limit for 8 consecutive one-minute readings."],
      ["Lowest vacuum pressure observed", "The lowest recorded chamber vacuum during the event was 192.40 µbar against the specified control band of 650 to 950 µbar."],
      ["Recovery", "Following needle-valve adjustment the vacuum was restored to 806.0 µbar at 21:08 hrs and remained stable thereafter."],
    ]
  ),
  investigationDetailsXml: para(
    "A detailed review of the vacuum-regulation mechanism of Lyophilizer L-1901 was conducted. The investigation established that the vacuum-regulation system relies on manual adjustment of the vacuum-control needle valve and does not utilise an automated closed-loop feedback system for fine vacuum-pressure control.",
    "Nitrogen pressure regulator malfunction was ruled out: supply pressure was approximately 1 bar, within the normal operating range. Needle valve mechanical malfunction was ruled out on physical inspection. Vacuum pump malfunction and chamber leakage were ruled out from the trend. Vacuum transmitter PE-0251 calibration was verified valid (calibrated 08/05/2026, due 07/11/2026).",
    "The nitrogen bleed flow to the chamber is not directly measured by a flow transmitter or flowmeter; therefore the actual flow during the event cannot be quantitatively confirmed. The effectiveness of the nitrogen bleed was assessed from the chamber pressure response following needle-valve adjustment."
  ),
  historicNarrativeXml: para(
    "Previously implemented CAPAs were verified as implemented and sustained. However, they are not considered fully effective in eliminating the residual risk associated with manual vacuum regulation during the transition into Primary Drying Step 1."
  ),
  historicTableXml: table(
    ["Sr. No.", "Date", "Event No.", "Batch No.", "Event Details", "Root Cause", "CAPA"],
    [
      ["1", "24/10/2025", "ERF/25/135", "RIG25008", "Vacuum excursion during primary drying Step 1", "Improper needle valve positioning", "Valve replaced; dual sign-off added to BMR"],
      ["2", "05/11/2025", "ERF/25/146", "RIG25009", "Vacuum outside momentary fluctuation limits at Step 4", "Inherent control system bandwidth", "Step-wise operating ranges defined in BMR"],
      ["3", "07/02/2026", "ERF/25/186", "RHI25063", "Vacuum exceeded upper limit at Step 4", "Refrigeration expansion valve malfunction", "Expansion valve replaced; historical review"],
    ]
  ),
  rootCauseXml: para(
    "The root cause of the event was the vacuum-control system limitation of Lyophilizer L-1901, which relies on a manually operated needle valve for fine chamber-pressure adjustment during the transition into Primary Drying Step 1. The installed system does not provide continuous closed-loop fine pressure modulation.",
    "Contributing factors: high sensitivity of the vacuum-control needle valve; absence of automated closed-loop chamber-pressure control; dynamic changes in sublimation rate and vapour load during process transitions."
  ),
  humanErrorTableXml: para("Not applicable — the root cause is not attributed to human error."),
  impactAssessmentXml: para(
    "Across the full 60-minute Primary Drying Step 1, shelf temperature held between -44.8 and -46.2 °C against a -45 °C setpoint, and the three product probes held between -41.4 and -44.8 °C. No abnormal temperature trend was observed.",
    "Analytical results reviewed to date: HMWP 0.21% (NMT 0.3%), Total related substances 0.31% (NMT 1.5%), Loss on Drying 4.09% (NMT 10.0%), Assay 101.3% (94.0–105.0%), Host Cell Proteins 2 ppm (NMT 10 ppm). Host Cell DNA is still under testing, so this assessment is interim."
  ),
  scopeAssessmentXml: para(
    "Review of concurrent batch data confirmed that no comparable pressure excursion was observed during the Primary Drying Step 1 transition for batches C072630015, C072630016 and C072630017. The historical review identified similar excursions in other batches, so RIG25014 represents a specific occurrence of a recurring vacuum-control behaviour rather than an isolated deviation."
  ),
  batchDispositionXml: para(
    "No adverse impact on the evaluated product quality attributes was identified. Final disposition is subject to completion of the pending Host Cell DNA result."
  ),
  correctionXml: para(
    "During batch processing the vacuum-control needle valve was manually adjusted by Engineering personnel to increase the nitrogen bleed and restore chamber vacuum to approximately 800 µbar, returning the parameter within the specified operating range."
  ),
  correctiveNarrativeXml: para("Actions arising directly from the identified root cause."),
  correctiveTableXml: table(
    ["Sr. No.", "Action Plan", "Responsibility", "Target Completion Date", "Reference / Change Control No."],
    [
      ["1", "Prepare and execute Lyophilizer Vacuum Control and Needle-Valve Position Study Protocol", "Engineering", "31/10/2026", "CC/26/014"],
      ["2", "Revise BMR-100-RIGC3-01 Section 7.16.31 to define the 20-minute stabilization period", "QA", "15/11/2026", "CC/26/015"],
    ]
  ),
  interimNarrativeXml: para("Controls covering the period until the corrective actions close."),
  interimTableXml: table(
    ["Sr. No.", "Action Plan", "Responsibility", "Target Completion Date", "Reference / Change Control No."],
    [["1", "Engineering to verify and record needle-valve position before each Primary Drying Step 1 transition, with supervisor countersign", "Production / Engineering", "Immediate until CC/26/015 closes", "ERF/26/022"]]
  ),
  preventiveNarrativeXml: para("Actions to prevent recurrence and improve detection."),
  preventiveTableXml: table(
    ["Sr. No.", "Action Plan", "Responsibility", "Target Completion Date", "Reference / Change Control No."],
    [
      ["1", "Configure and challenge a step-specific low-vacuum alarm (650 µbar for Step 1)", "Engineering", "30/11/2026", "CC/26/016"],
      ["2", "Prepare Lyophilizer Vacuum Control training module and One Page Lesson", "Engineering / QA", "31/12/2026", "CC/26/014"],
      ["3", "Engineering evaluation of automated MKS PID vacuum control valve", "Engineering", "31/03/2027", "CC/26/017"],
    ]
  ),
  effectivenessTableXml: table(
    ["Sr. No.", "Activity", "Acceptance Criteria", "Duration", "Responsibility", "Remarks"],
    [
      ["1", "Review Step-1 vacuum trends for subsequent batches", "No excursion beyond the defined 20-minute stabilization window", "Next 10 batches / 6 months", "QA", "—"],
      ["2", "Verify low-vacuum alarm actuation", "Alarm annunciates within the step-specific operating range", "At protocol execution", "Engineering", "—"],
    ]
  ),
  attachmentsTableXml: table(
    ["Attachment No.", "Description", "Document Reference No.", "No. of Pages"],
    [
      ["1", "Batch trend report of RIG25014", "Print_Lyophilizer_RIG25014", "76"],
      ["2", "Calibration certificate of vacuum transmitter PE-0251", "MJBPL/S26/PE 0251", "1"],
      ["3", "Justification report for 20-minute vacuum stabilization", "SOP/QA/002-F09", "4"],
    ]
  ),
};

const zip = new PizZip(fs.readFileSync(TPL));
const doc = new Docxtemplater(zip, {
  paragraphLoop: true,
  linebreaks: true,
  delimiters: { start: "{", end: "}" },
  nullGetter: () => "",
});
doc.render(data);
fs.mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });
fs.writeFileSync(OUT, doc.getZip().generate({ type: "nodebuffer" }));
console.log("wrote", OUT, `font=${FONT} sz=${SZ}`);
