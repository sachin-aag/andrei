/**
 * QAD-SOP-MS-001-F04 — Vendor Qualification for KSM/KRM/Critical Raw Materials.
 * Numbering, wording and row layout follow the 3xper master form (48-page A4).
 * The editor renders every field here; `export-xml.ts` reproduces the paper
 * layout from the same spec, so a field missing here is missing in both.
 */

export type VqChoice = "" | "yes" | "no" | "na";

export type VqFieldKind =
  /** Free text in the answer column. */
  | "text"
  | "textarea"
  /** `Yes ☐ | No ☐` */
  | "yes_no"
  /** `Yes ☐ | No ☐ | N/A ☐` */
  | "yes_no_na"
  /** `Yes ☐ | No ☐ | N/A ☐ | <Comments / Reference>` — text in `${id}__ref`. */
  | "yes_no_na_ref"
  /** `Yes ☐ | Ref: … | No ☐ | N/A ☐` (Section A §3). */
  | "yes_ref_no_na"
  /** `Enclosed ☐ | Ref: … | N/A ☐` (Section A 1.5.4–1.5.5). Enclosed saves as "yes". */
  | "enclosed_ref_na"
  /** `Ref: …` */
  | "ref"
  /** `Ref: … | <note in the Reference column>` — note in `${id}__note`. */
  | "ref_note"
  /** One tick among custom options (designed / adapted). */
  | "choice"
  /** Independent tick boxes; each option saves "yes" under its own id. */
  | "checks"
  /** A single tick box after `detail` text (F monographs). */
  | "check"
  /** Question text only — the answers follow in continuation rows. */
  | "label"
  /** Printed value, not editable (e.g. "To be filled by : Vendor"). */
  | "static"
  /** Fixed-size inline table; cell (r, c) saves under `${id}__r${r}c${c}`. */
  | "grid";

export type VqOption = { value: string; label: string };
export type VqCheckOption = { id: string; label: string };

export type VqField = {
  id: string;
  number?: string;
  kind: VqFieldKind;
  label: string;
  required?: boolean;
  /** Continuation row: shares the previous row's number cell (vertical merge). */
  cont?: boolean;
  /** Bullet ▪ before the question text (sub-items on the paper form). */
  bullet?: boolean;
  /** Question and answer share one cell: `Please, specify: <answer>`. */
  wide?: boolean;
  /** Text printed inside the answer cell before the answer (`Name:`). */
  prefix?: string;
  /** Text printed after the answer (`Years`). */
  suffix?: string;
  /** Printed into the answer cell of the previous row instead of a new row. */
  joinPrevious?: boolean;
  /** Bold question text (a row that works as a sub-heading, e.g. A 2.3). */
  strong?: boolean;
  /** Header printed in the trailing Comments/Reference cell of this row. */
  trailing?: string;
  /** Answer lives in the Comments/Reference column; the question spans the rest. */
  refColumn?: boolean;
  /** Yes/No shown on the left (shaded), question text in the answer column (A 1.2). */
  lead?: boolean;
  options?: readonly VqOption[];
  checks?: readonly VqCheckOption[];
  /** Tick options stacked in one cell instead of side by side. */
  vertical?: boolean;
  /** `check`: text printed before the tick box in the answer cell. */
  detail?: string;
  /** `static`: the printed value. */
  value?: string;
  /** `grid` column headers and row count. */
  columns?: readonly string[];
  rows?: number;
};

/** Where a group prints in the Word form when it is not inside its own section. */
export type VqGroupPlacement = "vendor_completion" | "interim_approval";

export type VqGroup = {
  /** Printed in the banner's number cell (`1.1`). Omit for full-width banners. */
  number?: string;
  /** Banner text. Empty string → no banner row. */
  title: string;
  /** Unshaded rows printed under the banner (instructions, "Does the product contain:"). */
  note?: string;
  /** The note is part of the grey banner (Section B §2). */
  noteShaded?: boolean;
  /** Plain (unshaded, bold) banner — A §4.x subsystem headers. */
  plain?: boolean;
  /** Header in the banner's trailing cell: "Comments", "Reference", "Comment". */
  answerHeader?: string;
  /** Wide Yes / No / NA cells (Sections K–N). */
  wideChoices?: boolean;
  /** Printed label for N/A: the K–N checklists print "NA". */
  naLabel?: string;
  /** `label : value` rows (cover and the vendor section header). */
  colon?: boolean;
  /** Prints somewhere other than its own section in the Word form. */
  placement?: VqGroupPlacement;
  fields: VqField[];
};

export type VqMatrixSpec = {
  headers: readonly string[];
  /** Banner above the table (A §8, N CAPA summary). */
  title?: string;
  note?: string;
  /** Empty rows are padded up to this count, like the blank rows on paper. */
  minRows?: number;
  /** N: "Is this completed?" header over Yes / No / Comment. */
  capa?: boolean;
};

export type VqMaterialHeader = {
  /** First header cell ("Material Brand Name" in B, "Material Name / Brand Name" elsewhere). */
  nameLabel: string;
  /** Second header cell ("Chemical Name (if applicable)" or F's "Material Type"). */
  typeLabel: string;
};

export type VqFormSection = {
  letter?: string;
  /** Editor title. */
  title: string;
  /** Section banner as printed on the paper form. */
  banner?: string;
  /** Shaded instruction lines under the banner. */
  instruction?: string;
  identity?: boolean;
  materialHeader?: VqMaterialHeader;
  groups: VqGroup[];
  matrix?: VqMatrixSpec;
  narrativeLabel?: string;
  /** Narrative prints before the matrix (A: 7. Comments then 8. References). */
  narrativeFirst?: boolean;
  /** Groups printed after the matrix (N: conclusion under the CAPA table). */
  afterMatrix?: VqGroup[];
};

/** Paper form stars live in `required`, not in the question text. */
export function stripVqLeadingStar(label: string): string {
  return label.replace(/^\*\s*/, "");
}

/** Editor / Word caption: `1.6.2 * Please give…` — one star, original casing. */
export function vqFieldCaption(field: VqField): string {
  const label = stripVqLeadingStar(field.label);
  const number = field.number?.trim() ? `${field.number} ` : "";
  const star = field.required ? "* " : "";
  return `${number}${star}${label}`;
}

type Extra = Partial<Omit<VqField, "id" | "number" | "kind" | "label">>;

function f(
  kind: VqFieldKind,
  id: string,
  number: string,
  label: string,
  extra: Extra = {}
): VqField {
  const required = extra.required ?? label.trimStart().startsWith("*");
  return {
    id,
    number,
    kind,
    label: stripVqLeadingStar(label),
    ...extra,
    required,
  };
}

const text = (id: string, number: string, label: string, extra?: Extra) =>
  f("text", id, number, label, extra);
const area = (id: string, number: string, label: string, extra?: Extra) =>
  f("textarea", id, number, label, extra);
const yn = (id: string, number: string, label: string, extra?: Extra) =>
  f("yes_no", id, number, label, extra);
const yna = (id: string, number: string, label: string, extra?: Extra) =>
  f("yes_no_na", id, number, label, extra);
const ynr = (id: string, number: string, label: string, extra?: Extra) =>
  f("yes_no_na_ref", id, number, label, extra);
const ref = (id: string, number: string, label: string, extra?: Extra) =>
  f("ref", id, number, label, extra);
const refNote = (id: string, number: string, label: string, extra?: Extra) =>
  f("ref_note", id, number, label, extra);
const label = (id: string, number: string, text: string, extra?: Extra) =>
  f("label", id, number, text, extra);

/** Continuation row helper: same number cell as the row above. */
function cont(field: VqField): VqField {
  return { ...field, cont: true };
}

export const VQ_FORM_NO = "QAD-SOP-MS-001-F04";
export const VQ_FORM_TITLE =
  "VENDOR QUALIFICATION FOR KSM/KRM/ CRITICAL RAW MATERIALS";
export const VQ_FORM_REVISION = "01";
export const VQ_SITE_ADDRESS_LINES = [
  "3xper Innoventure Ltd,",
  "Plot No. 53, Part 54 & 55,",
  "Palachur Village,",
  "Naidupeta SEZ – 524421",
] as const;
export const VQ_SITE_ADDRESS = VQ_SITE_ADDRESS_LINES.join(" ");

export const VQ_VENDOR_INSTRUCTION =
  "The questionnaire should be completed by the Vendor, and an additional sheet may be used for any extra information";

export const VQ_REQUIRED_SECTION_LETTERS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
] as const;

export type VqSectionLetter = (typeof VQ_REQUIRED_SECTION_LETTERS)[number];

export const VQ_REQUIRED_SECTION_TITLES: Record<VqSectionLetter, string> = {
  A: "General Company Information and Quality Management Questionnaire",
  B: "TSE/BSE Risk Analysis Questionnaire",
  C: "GMO – Vegetable Origin Questionnaire",
  D: "Allergen Questionnaire",
  E: "Extended Quality Questionnaire",
  F: "Packaging Material Questionnaire",
  G: "Elemental Impurities Questionnaire",
  H: "Residual Solvent Questionnaire",
  I: "Potential Genotoxic Impurity (PGI) Questionnaire",
  J: "Nitrosamine Impurity Questionnaire",
  K: "Willingness to Inspection",
  L: "Change Notification",
  M: "Quality Agreement",
  N: "Audit Checklist",
};

export const VQ_DEFAULT_CONTACTS = {
  contactName: "Chinamuthevi Phani Raja Kumar",
  contactTitle: "Deputy General Manager – Supply Chain Management",
  contactSite: "3xper Innoventure Limited",
  contactAddress:
    "Chola Crest, No. C54-55 & Super B-4, Thiru-Vi-Ka Industrial Estate, Guindy, Chennai – 600 032",
  contactPhone: "044 4217 7770-5",
  contactEmail: "Chinamuthevi.phani@3xper.murugappa.com",
} as const;

/** Default rows of the signature table printed at the bottom of every page. */
export const VQ_FORM_OWNERS = [
  {
    activity: "Prepared By",
    name: "Anantha Kumar D",
    designation: "Assistant Manager – QAD",
  },
  {
    activity: "Reviewed By",
    name: "Sarat Kumar Y",
    designation: "Deputy Manager – QAD",
  },
  {
    activity: "Approved By",
    name: "Narayan Kumar S",
    designation: "Head Quality",
  },
] as const;

export const VQ_PAGE_SIGNATURE_HEADERS = [
  "Name of the Activity",
  "Name",
  "Designation",
  "Signature",
  "Date",
] as const;

/** Cover page 3 — printed instructions to the vendor. */
export const VQ_VENDOR_PROCEDURE = {
  lead: "Quality Assurance (or equivalent) department of Vendor to fill the vendor questionnaire (all the applicable sections) with all the information available at the vendor site as per the requirement specified by 3xper Innoventure Limited.",
  contactLine:
    "The contact person listed below will receive the duly filled and signed vendor questionnaire.",
  bullets: [
    "This questionnaire should not be filled out by a representative from the Marketing office or General Headquarters/ Corporate office.",
    "Take sufficient time to fill out this questionnaire with as much detail as possible. The information will facilitate the evaluation and potential approval/qualification of your company as a supplier.",
    "Answer all questions (if a question is not applicable, please mark it as N/A).",
    "Fields marked with an asterisk (*) are mandatory and must be completed before submission. Incomplete forms may result in rejection.",
    "If additional space is needed to provide complete information for any section of this evaluation, you may use additional attachments as necessary and list them in the reference list.",
    "The last page of Section A must be signed by company representatives to indicate their agreement with all sections.",
    "If your answer yes to questions 2.2 and 2.3 of Section A, please ensure that you fill out Section C & D for further clarification.",
    "The completed form (duly signed) must be submitted to the contact detailed below.",
    "If you are an agent, distributing product manufactured by another company, please supply the details of the manufacturing companies for each of the products listed below and return to the contact specified below.",
  ],
} as const;

export const VQ_COVER_PROCEDURE =
  "The supply chain department (Purchase department) of 3xper shall obtain the vendor questionnaire (preassessment form) from the Quality Assurance department of 3xper and the requirement defined by the Quality Assurance department of 3xper.";

export const VQ_COMPLETION_STATEMENTS = [
  "Hereby, I confirm that the enclosed information is accurate and relevant to the product(s) in scope.",
  "Hereby, I confirm that any changes to the product specs (information in this questionnaire) shall be informed to customer.",
  "Customer can share comments, if any, to us.",
] as const;

export const VQ_SCORING_GUIDANCE = [
  ["Excellent:", "All mandatory questions answered + all optional questions answered."],
  ["Good:", "All mandatory questions are answered, and most optional questions are completed with relevant attachments."],
  ["Fair:", "Only mandatory questions answered"],
  ["Poor:", "Mandatory questions not fully answered."],
] as const;

export const VQ_SCORING_OUTCOMES = [
  ["Poor:", "The questionnaire will be rejected if it is scored as “Poor” and will be returned to the SCM personnel for further coordination with the vendor."],
  ["Fair:", "If the questionnaire is scored as “Fair” additional details will be requested from the vendor through the SCM Department."],
  ["Good:", "If the questionnaire is scored as 'Good', it will be approved based on the assessment and conclusion of 3xper QA personnel."],
  ["Excellent:", "The questionnaire will be approved for further processing."],
] as const;

const ORIGIN_ITEMS = [
  ["synthetic", "Synthetic"],
  ["fermentation", "Fermentation"],
  ["vegetable", "Vegetable"],
  ["mineral", "Mineral"],
  ["animal", "Animal (if YES, please complete section B as well)"],
  ["bovine", "Bovine (or by-products)"],
  ["porcine", "Porcine (or by-products)"],
  ["poultry", "Poultry (or by-products)"],
  ["fish", "Fish (or by-products)"],
  ["human", "Human (or by-products)"],
] as const;

function originGroup(prefix: string, base: string, title: string): VqGroup {
  return {
    number: `${base}.`,
    title,
    answerHeader: "Comments",
    fields: ORIGIN_ITEMS.map(([slug, itemLabel], i) =>
      ynr(`${prefix}_${slug}`, `${base}.${i + 1}.`, itemLabel)
    ),
  };
}

const ALLERGENS: Array<[string, string]> = [
  ["1.1", "Cereals containing gluten and products thereof"],
  ["1.2", "Crustaceans and products thereof"],
  ["1.3", "Eggs and products thereof"],
  ["1.4", "Fish and products thereof"],
  ["1.5", "Peanuts and products thereof"],
  ["1.6", "Soybeans and products thereof"],
  ["1.7", "Milk and dairy products (including lactose)"],
  ["1.8", "Nuts and nut products"],
  ["1.9", "Celery and products thereof"],
  ["1.10", "Mustard and products thereof"],
  ["1.11", "Sesame seeds and products thereof"],
  ["1.12", "Sulphur dioxide and sulphites at concentrations of more than 10 mg/kg or 10mg/liter expressed as SO2"],
  ["1.13", "Lupine"],
  ["1.14", "Molluscs (gastropods, bivalves, cephalopods)"],
  ["1.15", "Maize and products thereof"],
  ["1.16", "Sugar (sucrose)"],
  ["1.17", "Benzoates"],
  ["1.18", "BHA/BHT"],
  ["1.19", "Cinnamon, Cocoa, Vanilla, Chicken, Yeast, Legumes (other than Peanut), Pulses, Coriander, Umbelliferae, Flavour (any artificial/natural), Glutamate (% if naturally occurring), Carrot"],
];

const MATERIAL_HEADER: VqMaterialHeader = {
  nameLabel: "Material Name / Brand Name",
  typeLabel: "Chemical Name (if applicable)",
};

/** `Sections A – …` tick list used by both the vendor and 3xper summaries. */
function sectionTicks(
  id: string,
  letters: readonly VqSectionLetter[],
  prefix: string
): VqField {
  return {
    id,
    kind: "checks",
    label: "Sections completed",
    vertical: true,
    checks: letters.map((letter) => ({
      id: `${prefix}${letter}`,
      label: `Sections ${letter} – ${VQ_SUMMARY_TITLES[letter]}`,
    })),
  };
}

/** Section titles as the two summary tick lists print them. */
const VQ_SUMMARY_TITLES: Record<VqSectionLetter, string> = {
  ...VQ_REQUIRED_SECTION_TITLES,
  K: "Willingness to inspection",
};

const SUMMARY_NOTE =
  "Please, tick the boxes for the sections you (Vendor) have completed.";

export const VQ_FORM: Record<string, VqFormSection> = {
  vq_cover: {
    title: "Cover — 3xper issuance",
    instruction: VQ_COVER_PROCEDURE,
    groups: [
      {
        title: "Material and manufacturer",
        colon: true,
        fields: [
          {
            id: "cover_filled_by",
            kind: "static",
            label: "To be filled by",
            value: "3XPER INNOVENTURE LTD",
          },
          {
            id: "cover_rm_type",
            kind: "checks",
            label: "Type of RM Manufacturing",
            vertical: true,
            checks: [
              { id: "cover_rm_ksm", label: "Key Starting Material (KSM)" },
              { id: "cover_rm_crm", label: "Critical Raw Material (CRM)" },
              { id: "cover_rm_krm", label: "Key Raw Material (KRM)" },
            ],
          },
          text("cover_manufacturer", "", "Name of the Manufacturer:", {
            required: true,
          }),
          text("cover_material", "", "Name of the Material", {
            required: true,
          }),
        ],
      },
      {
        title: "Sections required for this vendor (KSM Vendor Assessment Requirement)",
        fields: VQ_REQUIRED_SECTION_LETTERS.map((letter) =>
          yn(
            `cover_req_${letter}`,
            `Section ${letter}`,
            VQ_REQUIRED_SECTION_TITLES[letter]
          )
        ),
      },
      {
        title: "Remarks",
        fields: [area("cover_remarks", "", "Remarks:")],
      },
      {
        title: "Document issue and receipt",
        fields: [
          text("cover_issued_name", "", "Document Issued By (Quality Assurance) — Name"),
          text("cover_issued_sign_date", "", "Document Issued By (Quality Assurance) — Sign & Date"),
          text("cover_received_name", "", "Document Received By (SCM) — Name"),
          text("cover_received_sign_date", "", "Document Received By (SCM) — Sign & Date"),
        ],
      },
      {
        title: "3xper company contact (questionnaire recipient)",
        colon: true,
        fields: [
          text("cover_contact_name", "", "Company Contact Person"),
          text("cover_contact_title", "", "Position/Title"),
          text("cover_contact_site", "", "Company Site/Location"),
          area("cover_contact_address", "", "Address"),
          text("cover_contact_phone", "", "Telephone number"),
          text("cover_contact_email", "", "Email address"),
        ],
      },
    ],
  },
  vq_section_a: {
    letter: "A",
    title: "General Company Information and Quality Management",
    banner: "A: General Information on Company, Product and Quality Management",
    identity: true,
    groups: [
      {
        title: "VENDOR SECTION",
        colon: true,
        fields: [
          {
            id: "a_filled_by",
            kind: "static",
            label: "To be filled by",
            value: "Vendor",
          },
          text("a_area", "", "Area/Products of interest"),
          text("a_material_name", "", "Material Name / Brand Name"),
          text("a_chemical_name", "", "Chemical Name"),
          text("a_material_code", "", "Material Code"),
          text("a_product_code", "", "Product Code"),
        ],
      },
      { title: "1. Company Information", fields: [] },
      {
        number: "1.1",
        title: "Company/ Address Information",
        fields: [
          text("a_1_1_1", "1.1.1", "*Name of company:"),
          area("a_1_1_2", "1.1.2", "*Address:"),
          text("a_1_1_3", "1.1.3", "*Postcode:"),
          text("a_1_1_4", "1.1.4", "*Country:"),
          text("a_1_1_5", "1.1.5", "*Telephone number:"),
          text("a_1_1_6", "1.1.6", "*Fax number / email address:"),
          text("a_1_1_7", "1.1.7", "*Web address:"),
        ],
      },
      {
        number: "1.2",
        title: "*Is the address listed above the only site for production?",
        fields: [
          yn("a_1_2", "", "If no, please provide details below", { lead: true }),
          text("a_1_2_1", "1.2.1", "Name of company(s):"),
          area("a_1_2_2", "1.2.2", "Address:"),
          text("a_1_2_3", "1.2.3", "Postcode:"),
          text("a_1_2_4", "1.2.4", "Telephone number:"),
          text("a_1_2_5", "1.2.5", "Fax number / email address:"),
        ],
      },
      {
        number: "1.3",
        title: "*Is your company a subsidiary?",
        fields: [
          yn("a_1_3", "", "If yes, please provide details below", { lead: true }),
          text("a_1_3_1", "1.3.1", "Name of company:"),
          area("a_1_3_2", "1.3.2", "Address:"),
          text("a_1_3_3", "1.3.3", "Postcode:"),
          text("a_1_3_4", "1.3.4", "Telephone number:"),
          text("a_1_3_5", "1.3.5", "Fax number / email address:"),
        ],
      },
      {
        number: "1.4",
        title: "Contact Information (Please provide details of an available contact)",
        fields: [
          text("a_1_4_1", "1.4.1", "*Name:"),
          text("a_1_4_2", "1.4.2", "*Position:"),
          text("a_1_4_3", "1.4.3", "*Telephone number:"),
          text("a_1_4_4", "1.4.4", "*Fax number:"),
          text("a_1_4_5", "1.4.5", "*Fax number / email address:"),
        ],
      },
      {
        number: "1.5",
        title: "Site Personnel Information",
        fields: [
          text("a_1_5_1", "1.5.1", "*Approximate total number of employees at facility of interest:"),
          text("a_1_5_2", "1.5.2", "*Approximate number of employees in the Quality Unit (Quality Assurance/Quality Control)"),
          text("a_1_5_3", "1.5.3", "*Approximate number of employees in Production/Operations Unit"),
          f("enclosed_ref_na", "a_1_5_4", "1.5.4", "If available, please enclose a copy of your Organisational chart indicating key personnel."),
          f("enclosed_ref_na", "a_1_5_5", "1.5.5", "If available, could you please supply copies of any sales information for the products listed on the front of this form?"),
          yn("a_1_5_6", "1.5.6", "Does your factory operate in a shift system?"),
          text("a_1_5_7", "1.5.7", "How many shifts?"),
          text("a_1_5_8", "1.5.8", "How many days a week?"),
        ],
      },
      {
        number: "1.6",
        title: "Company structure",
        fields: [
          text("a_1_6_1", "1.6.1", "*What is the legal ownership structure of your company?"),
          ref("a_1_6_2", "1.6.2", "*Please give a brief structure-diagram"),
          yn("a_1_6_3", "1.6.3", "*Do you expect a change of the legal status and/or ownership of your company in the near future?"),
          yn("a_1_6_4", "1.6.4", "*Do you have an annual report available?"),
          ref("a_1_6_5", "1.6.5", "If yes, please enclose the annual report / Sustainable report / declaration"),
        ],
      },
      { title: "2. Product Information", fields: [] },
      originGroup("a_2_1", "2.1", "*Origin of the main ingredients:"),
      originGroup(
        "a_2_2",
        "2.2",
        "*Origin of the carrier components and/or any material used in the manufacture"
      ),
      {
        title: "",
        fields: [
          yna("a_2_3", "2.3.", "Additives / Stabilizers (if applicable)", {
            strong: true,
            trailing: "Comments",
          }),
          text("a_2_3_1", "2.3.1.", "*Additive E Numbers / Name of the stabilizer"),
          ynr("a_2_3_2", "2.3.2.", "*Other additives than colours and sweeteners (Dir. 95/2/EC* and subsequent amendments.)"),
          ynr("a_2_3_3", "2.3.3.", "*Purity criteria (Dir. 96/77/EC* and subsequent amendments.)"),
          ynr("a_2_3_4", "2.3.4.", "*Other relevant purity criteria applicable"),
        ],
      },
      {
        title: "3. Quality Standards and Certifications",
        fields: [
          f("yes_ref_no_na", "a_3_1", "3.1.", "*Do you hold certification(s) against any recognized quality standards by an accredited third-party body e.g., ISO 9001, 14001 or 22000? If yes, please provide a copy of certificate(s)."),
          f("yes_ref_no_na", "a_3_2", "3.2.", "*Do you hold accreditation, certification or registration by any regulatory agency or body? If yes, please provide a copy of documentation"),
          f("yes_ref_no_na", "a_3_3", "3.3.", "*Are any aspects of the process / service provided subcontracted?"),
          text("a_3_3_1", "3.3.1.", "If so, please provide detail:"),
          f("yes_ref_no_na", "a_3_3_2", "3.3.2.", "*Are there Quality / Technical Agreements held with subcontractors?"),
        ],
      },
      {
        title: "4. Quality Management Documentation",
        note: "Do you have procedures that document how you perform the following activities?\nIf ‘YES’ please provide the document reference number / identification/ Copy of ISO 9001 Certificate.\nIn case you are certified towards ISO 9001, only 4.1.2, 4.1.7, 4.1.11, 4.2.1, 4.2.2, 4.4.1, 4.4.4 and 4.5.2 are mandatory.",
        fields: [],
      },
      {
        number: "4.1.",
        title: "Quality System",
        plain: true,
        answerHeader: "Reference",
        fields: [
          ynr("a_4_1_1", "4.1.1.", "*Quality Policy / Manual"),
          ynr("a_4_1_2", "4.1.2.", "*Equipment & Instrument Validation / Qualification Program"),
          ynr("a_4_1_3", "4.1.3.", "*Internal Audit / Self-Inspection Program"),
          ynr("a_4_1_4", "4.1.4.", "*Supplier Evaluation / Qualification Program"),
          ynr("a_4_1_5", "4.1.5.", "*Does your company operate a supplier-auditing system?"),
          ynr("a_4_1_6", "4.1.6.", "*Training Program"),
          ynr("a_4_1_7", "4.1.7.", "*Change Control"),
          ynr("a_4_1_8", "4.1.8.", "*Deviation / Investigation Reporting"),
          ynr("a_4_1_9", "4.1.9.", "*Non-Conformance Reporting"),
          ynr("a_4_1_10", "4.1.10.", "*Documentation Control"),
          ynr("a_4_1_11", "4.1.11.", "*Do you have a recall system/procedure in place?"),
        ],
      },
      {
        number: "4.2.",
        title: "Production / Operations System",
        plain: true,
        answerHeader: "Reference",
        fields: [
          ynr("a_4_2_1", "4.2.1.", "*Environmental Monitoring Program"),
          ynr("a_4_2_2", "4.2.2.", "*Housekeeping Program"),
          ynr("a_4_2_3", "4.2.3.", "*Gowning / Entry & Exit Procedure"),
          ynr("a_4_2_4", "4.2.4.", "*Availability of Master Production Instructions and Batch production Records"),
          ynr("a_4_2_5", "4.2.5.", "*Availability of Equipment Cleaning Procedures, Cleaning Records and Cleaning Verification"),
        ],
      },
      {
        number: "4.3",
        title: "Packaging / Labelling System",
        plain: true,
        answerHeader: "Reference",
        fields: [
          ynr("a_4_3_1", "4.3.1", "*Labelling of Intermediate / Final Products"),
          ynr("a_4_3_2", "4.3.2", "*Storage of Intermediate / Final Products"),
          ynr("a_4_3_3", "4.3.3", "*Product / Sample Shipping Validation Program"),
        ],
      },
      {
        number: "4.4",
        title: "Facilities And Equipment System",
        plain: true,
        answerHeader: "Reference",
        fields: [
          ynr("a_4_4_1", "4.4.1", "*Pest Control Program"),
          ynr("a_4_4_2", "4.4.2", "*Preventive Maintenance Program"),
          ynr("a_4_4_3", "4.4.3", "*Calibration Program"),
          ynr("a_4_4_4", "4.4.4", "*Facility Cleaning / Sanitization"),
          ynr("a_4_4_5", "4.4.5", "*Is equipment master list available?"),
          cont(refNote("a_4_4_5_list", "4.4.5", "*If yes, attach the Master List. If no, assessment summary report to be attached.")),
        ],
      },
      {
        number: "4.5",
        title: "Laboratory Control System",
        plain: true,
        answerHeader: "Reference",
        fields: [
          ynr("a_4_5_1", "4.5.1", "*Method Qualification for all assays used in Testing of Samples"),
          ynr("a_4_5_2", "4.5.2", "*Testing Reagents and Standards Controls Policy / Procedure"),
          ynr("a_4_5_3", "4.5.3", "*Sample Retention Program"),
          ynr("a_4_5_4", "4.5.4", "*Out of Specification (OOS) / Retest Procedures"),
          ynr("a_4_5_5", "4.5.5", "*Availability of Analytical Raw Data Documentation"),
          ynr("a_4_5_6", "4.5.6", "*Is laboratory instrument master list available?"),
          cont(refNote("a_4_5_6_list", "4.5.6", "If yes, attach the Master List. If no, assessment summary report to be attached.")),
        ],
      },
      {
        number: "4.6",
        title: "Materials Control System",
        plain: true,
        answerHeader: "Reference",
        fields: [
          ynr("a_4_6_1", "4.6.1", "*Materials Movement into the Facility"),
          ynr("a_4_6_2", "4.6.2", "*Inventory Management System"),
          ynr("a_4_6_3", "4.6.3", "*Warehouse System and Storage"),
          ynr("a_4_6_4", "4.6.4", "*Is list of storage facility along with temperature condition available?"),
          cont(refNote("a_4_6_4_list", "4.6.4", "If yes, attach the Master List. If no, assessment summary report to be attached.")),
          ynr("a_4_6_5", "4.6.5", "*Inspection and Testing of Incoming Materials"),
        ],
      },
      {
        number: "4.7",
        title: "Other",
        plain: true,
        answerHeader: "Reference",
        fields: [
          ynr("a_4_7_1", "4.7.1", "*Contract Review"),
          ynr("a_4_7_2", "4.7.2", "*Supply Chain Requirements"),
          ynr("a_4_7_3", "4.7.3", "*Product Identification / Traceability"),
        ],
      },
      {
        title: "5. Regulatory Compliance and History",
        fields: [
          yna("a_5_1", "5.1", "*Has the company been subject to periodic audit by competent authorities e.g., MHRA, EMA, FDA, ISO inspection body etc?"),
          ref("a_5_1_1", "5.1.1", "If ‘YES’ please provide details below for the past 3 years and attach certificate / supporting documents along with filled questionnaire (e.g., ISO certificate, GMP certificate, EIR cover letter)", { wide: true }),
          cont({
            id: "a_5_1_1_inspections",
            number: "5.1.1",
            kind: "grid",
            label: "Inspections in the past 3 years",
            columns: [
              "Name of the Authority\n(Regulatory Agency)",
              "Inspection Date",
              "Compliance Outcome",
            ],
            rows: 4,
          }),
        ],
      },
      {
        number: "5.2",
        title: "Regulatory Compliance\n(If YES is applicable, please specify the legislation of the material is compliant with)",
        answerHeader: "Comment",
        fields: [
          text("a_5_2_remark", "", "Remark: If YES, please specify the legislation you are compliant to", { refColumn: true }),
          ynr("a_5_2_1", "5.2.1", "*Mycotoxin (Regulation 1881/2006/EC and subsequent amendments)"),
          ynr("a_5_2_2", "5.2.2", "*Dioxin (Regulation 1881/2006/EC and subsequent amendments)"),
          ynr("a_5_2_3", "5.2.3", "*Ionisation"),
          ynr("a_5_2_4", "5.2.4", "*Pesticide Residues"),
          ynr("a_5_2_5", "5.2.5", "*Heavy Metals Specified"),
          ynr("a_5_2_6", "5.2.6", "*Polycyclic Aromatic Hydrocarbons (PAH)"),
          ynr("a_5_2_7", "5.2.7", "*Polychlorinated Biphenyls (PCBs)"),
          ynr("a_5_2_8", "5.2.8", "*Nitrate"),
          ynr("a_5_2_9", "5.2.9", "*BSE / TSE"),
          ynr("a_5_2_10", "5.2.10", "*Product Data Sheet"),
          ynr("a_5_2_11", "5.2.11", "*Safety Data Sheet"),
        ],
      },
      {
        title: "6. Industry History",
        fields: [
          yna("a_6_1", "6.1", "*Do you supply to any other customer in the Pharmaceutical / Health care industry?"),
          text("a_6_1_1", "6.1.1", "If ‘YES’, please specify the approximate % of your business that this relates to:"),
          yna("a_6_2", "6.2", "*Have you been audited by any Pharmaceutical / Health care companies / Qualified Personnel (QP) within the last two years?"),
        ],
      },
    ],
    narrativeLabel: "7. Comments",
    narrativeFirst: true,
    matrix: {
      title: "8. References – Appendices",
      note: "Please, list all references and Attachments / enclosures that you make to this questionnaire and specify the reference number given to each document. Use one list for all sections of the document and extend it if needed.",
      headers: ["Ref # (Attachment Number)", "Appendix / document title"],
      minRows: 11,
    },
  },
  vq_section_b: {
    letter: "B",
    title: "TSE/BSE Risk Analysis Survey",
    banner: "B. *TSE/BSE Risk Analysis Survey",
    instruction: VQ_VENDOR_INSTRUCTION,
    identity: true,
    materialHeader: {
      nameLabel: "Material Brand Name",
      typeLabel: "Chemical Name (if applicable)",
    },
    groups: [
      {
        title: "1. Production Details",
        fields: [
          yn("b_1_1", "1.1", "*Is the product partially or fully of animal origin (i.e., tissue, tissue extract or fluid such as milk, serum, blood etc.)?"),
          yn("b_1_2", "1.2", "*Does the manufacturing process involve any raw materials, source materials, or reagents that are of animal origin?"),
          yn("b_1_3", "1.3", "*Is the product derived from microbiological or cell culture fermentations?"),
          text("b_1_3_1", "1.3.1", "If yes, please indicate type."),
          yn("b_1_3_2", "1.3.2", "If yes, are any components used in the media culture derived from animal origin?"),
          yn("b_1_5", "1.5", "*Is the product purified using chromatography media (e.g., specific ligand columns) or buffers that contain components of animal origin?"),
          yn("b_1_6", "1.6", "*Is any of the equipment used for processing or storage of the product in contact at any time with other materials of animal origin?"),
          yn("b_1_7", "1.7", "*Is the product, for any other reason, at any time, in contact with materials of animal origin? (Please provide details)"),
        ],
      },
      {
        title: "2. Material Details",
        note: "If the answer to ALL of the above questions in section B1 Production Details is NO, stop here. If the answer to any of the above questions in section B1 is YES please complete the remainder of the survey for each animal derived material used in, or in contact with, the product",
        noteShaded: true,
        fields: [
          text("b_2_1", "2.1", "What is the animal species (e.g., Bovine, Ovine, Caprine, Fish etc.)?"),
          text("b_2_2", "2.2", "What is the country(s) of origin of the animals?"),
          text("b_2_3", "2.3", "Please describe how the origin of raw materials is documented?"),
          yn("b_2_4", "2.4", "Is your raw material sourced directly from an intermediary or intermediaries?"),
          {
            id: "b_2_5",
            number: "2.5",
            kind: "checks",
            label: "To what level can the origin of the materials be traced? (Please tick as appropriate)",
            vertical: true,
            checks: [
              { id: "b_2_5_animals", label: "To the animals?" },
              { id: "b_2_5_farm", label: "To the farm?" },
              { id: "b_2_5_slaughterhouse", label: "To the slaughterhouse?" },
              { id: "b_2_5_country", label: "To the country?" },
            ],
          },
          text("b_2_5_1", "2.5.1", "If none of these apply, please provide details:"),
          yn("b_2_6", "2.6", "Is your company willing to be audited by a Health Authority if necessary?"),
          text("b_2_7", "2.7", "What are the raw materials suppliers’ own assessment of risk, if available?"),
          yn("b_2_8", "2.8", "1) Does the material undergo any form of treatment or processing, which would or may remove or reduce infectivity of the agents associated with transmissible spongiform encephalopathy?\n2) Are these processes validated"),
          text("b_2_9", "2.9", "If yes please specify the process and indicate the stage(s) during the manufacture of the product at which it takes place:"),
          text("b_2_10_attach", "2.10", "Please attach"),
          cont(ref("b_2_10_flow", "2.10", "1) a manufacturing process-outline or flow chart, and")),
          cont(ref("b_2_10_conditions", "2.10", "2) a general description of the conditions applied at each manufacturing step.")),
          yn("b_2_10", "2.10", "Is there a system in place at your company to verify for each lot of products and each lot of material used to manufacture your product that the above information is verified and documented?"),
          yn("b_2_11", "2.11", "Have you been granted a certificate of suitability by the EDQM (European Directorate for the Quality of Medicines)?"),
          ref("b_2_11_1", "2.11.1", "If yes, please attach a copy of the certificate"),
          yn("b_2_12_2", "2.12.2", "If no, have you applied for or will you apply for a certificate of suitability?"),
        ],
      },
    ],
    narrativeLabel: "Comments",
  },
  vq_section_c: {
    letter: "C",
    title: "Traceability of Ingredients Potentially Derived from GMO",
    banner: "C. *Traceability of Ingredients Potentially Derived from GMO",
    instruction:
      "In order to comply with current EU legislation on the labelling of foodstuffs containing genetically modified organisms (GMO) and to trace raw materials that have potentially been derived from GMO crops please complete the following questionnaire.\nIn case the questionnaire covers more than one product, please use a separate form C for each product.",
    identity: true,
    materialHeader: MATERIAL_HEADER,
    groups: [
      { title: "1. Raw Material Origin", fields: [] },
      {
        title: "Soya / Maize / Rice / Cotton Seed / Sugar Beet / Rape seed / Sunflower",
        fields: [
          yn("c_1_1", "1.1", "Is the product supplied to us derived from maize grains, rice grains, soy beans, cotton seeds, sunflower seeds, rape seeds or sugar beet?"),
          text("c_1_2", "1.2", "In any case, please indicate plant species from which the raw material is derived"),
          yn("c_1_3", "1.3", "Is the maize grain, rice grain, soy bean, cotton seed, sunflower seed, rape seed or sugar beet from a non-GM crop?"),
          text("c_1_4", "1.4", "Areas / countries of origin e.g., Europe?"),
          yn("c_1_5", "1.5", "Does the product supplied to us contain DNA or protein from a GM crop?"),
        ],
      },
      {
        title: "2. Pre-Processing Information",
        fields: [
          yn("c_2_1", "2.1", "Is the crop (maize grain / rice grain / soy bean / cotton seed / sunflower seed / rape seed / sugar beet) PCR (Polymerase Chain Reaction) tested prior to processing?"),
          text("c_2_2", "2.2", "Frequency of sampling PCR testing"),
          cont(text("c_2_2_a", "2.2", "a) All incoming batches")),
          cont(text("c_2_2_b", "2.2", "b) Representative sampling technique")),
          yn("c_2_3", "2.3", "Is an independent laboratory used for PCR test?"),
        ],
      },
      {
        title: "3. Transportation and Storage",
        fields: [
          yn("c_3_1", "3.1", "Are the maize grain / rice grain / soy bean / cotton seed / sunflower seed / rape seed / sugar beet segregated (GM / non-GM) during transportation to factory (designated vessels / Lorries)?"),
          yn("c_3_3", "3.3", "Is the raw material stored in designated tanks / silos prior to processing?"),
          text("c_3_2", "3.2", "Describe the procedures taken to avoid cross contamination between GM / Non-GM material"),
        ],
      },
      {
        title: "4. Processing",
        fields: [
          yn("c_4_1", "4.1", "After initial processing is the crude material (oil, slurry, etc….) PCR tested?"),
          yn("c_4_3", "4.3", "Is a dedicated processing line used for GM / non-GM material?"),
          text("c_4_2", "4.2", "If no, describe the measures taken to avoid cross contamination (e.g., cleaning procedures)"),
        ],
      },
      {
        title: "5. Quality Control and Management Procedures",
        fields: [
          yn("c_5_1", "5.1", "Is batch traceability back to origin of seed"),
          cont(yn("c_5_1_a", "5.1", "a) In place")),
          cont(yn("c_5_1_b", "5.1", "b) Documented")),
          cont(text("c_5_1_c", "5.1", "c) If no, please comment?")),
          cont(ref("c_5_1_d", "5.1", "d) If yes, provide relevant documentation")),
          yn("c_5_2", "5.2", "Is PCR testing for GM carried out on the final product?"),
          text("c_5_3", "5.3", "Please indicate frequency of test"),
          cont(text("c_5_3_a", "5.3", "a) Each batch")),
          cont(text("c_5_3_b", "5.3", "b) Representative sampling technique (state) method")),
          yn("c_5_4", "5.4", "Are PCR analysis results available for each batch of this product (supplied or to be supplied)?"),
          yn("c_5_5", "5.5", "Are designated barrels / drums, tankers, Lorries used for transportation of the final product?"),
          ref("c_5_6", "5.6", "Please provide a complete traceability exercise back to the crop origin i.e., seeds for one batch (if Soy / Maize / Rice / Cotton / Rape / Sunflower / Beet is used)"),
          ref("c_5_7", "5.7", "Please provide a statement on the GMO / non-GMO status of the raw material supplied to us"),
        ],
      },
    ],
    narrativeLabel: "Comments",
  },
  vq_section_d: {
    letter: "D",
    title: "Allergen",
    banner: "D. *Allergens",
    instruction: VQ_VENDOR_INSTRUCTION,
    identity: true,
    materialHeader: MATERIAL_HEADER,
    groups: [
      {
        title: "1. Allergen",
        note: "Does the product contain:",
        fields: ALLERGENS.map(([number, allergen]) =>
          yn(`d_${number.replace(".", "_")}`, number, allergen)
        ),
      },
      {
        title: "2. HACCP – Allergen Risk in Place (cross-contamination)",
        fields: [
          yn("d_2_1", "2.1.", "Are processing aids containing substances causing hypersensitivity listed in section 1, used during the manufacturing process?"),
          text("d_2_1_1", "2.1.1", "If yes, which one(s)? (Please indicate ppm level, where applicable)"),
          yn("d_2_2", "2.2", "Unintended presence of substances causing hypersensitivity (e.g., carry over / cross-contact).\nCan you exclude that the material contains any of the substances listed in section 1. due to unintended presence (e.g. cross-contact in the manufacturing site or during transportation, cross-contact / carry-over due to shared production lines, rework, dust, packaging, etc) ?"),
          text("d_2_2_1", "2.2.1", "If yes, please give details (e.g. used raw materials are under control – audits, supplier’s questionnaires –, efficient validated wet cleaning, system based on HACCP which excludes unintended presence, etc) :"),
          text("d_2_2_2", "2.2.2", "If no, please specify the reasons and for which substance(s) unintended presence is possible (please indicate ppm level, where applicable)"),
          ref("d_2_3", "2.3", "Please provide us a Manufacturing Process Flow"),
          ref("d_2_4", "2.4", "Please detail hereunder the exact Quantitative Product Composition"),
        ],
      },
    ],
    narrativeLabel: "Comments",
  },
  vq_section_e: {
    letter: "E",
    title: "Extended Quality Questionnaire",
    banner: "E. Extended Quality Questionnaire",
    instruction: VQ_VENDOR_INSTRUCTION,
    identity: true,
    materialHeader: MATERIAL_HEADER,
    groups: [
      {
        title: "1. General Information",
        fields: [
          yn("e_1_1", "1.1.", "*Are customer audits and/or inspections by agencies permitted?"),
          yn("e_1_3", "1.3.", "*Is the decision to release or reject a product for sale independent from production?"),
          text("e_1_4", "1.4", "*Who is signing the Certificate of Analysis (Analytical Report)?"),
          text("e_1_5", "1.5.", "*Who is responsible for the final product release / reject?"),
          text("e_1_6_name", "1.6", "*Who is responsible for contacts with us concerning quality matters?", { prefix: "Name:" }),
          text("e_1_6_pos", "1.6", "Position", { joinPrevious: true, prefix: "Position:", required: false }),
          label("e_1_7", "1.7", "*What kind of product do you manufacture"),
          cont(yn("e_1_7_bulk", "1.7", "Bulk raw materials?", { bullet: true })),
          cont(yn("e_1_7_pharma", "1.7", "Bulk raw materials for pharmaceuticals?", { bullet: true })),
          cont(yn("e_1_7_api", "1.7", "Active pharmaceutical ingredients?", { bullet: true })),
          cont(yn("e_1_7_tech", "1.7", "Technical products?", { bullet: true })),
          cont(yn("e_1_7_pack", "1.7", "Packaging material?", { bullet: true })),
          cont(yn("e_1_7_other", "1.7", "Others?", { bullet: true })),
          cont(text("e_1_7_specify", "1.7", "Please, specify:", { wide: true })),
          ref("e_1_8", "1.8", "*Please, attach brief flow diagram of the process, including information about where in-process controls are performed. Special attention must be given to the last step in the process e.g., reagents, precipitation agent and solvents."),
        ],
      },
      {
        title: "2. Personnel, Training and Education",
        fields: [
          yna("e_2_1", "2.1", "*Do you have written job descriptions for all personnel?"),
          yna("e_2_2", "2.2", "*Do you have procedures that document how you perform training?"),
          yna("e_2_3", "2.3", "*Do you maintain records of the training?"),
          yna("e_2_4", "2.4", "*Are your personnel aware that the products supplied are used for the manufacturing of active pharmaceutical ingredients?"),
        ],
      },
      {
        number: "2.5",
        title: "Does the Training Program in place have the following elements?",
        fields: [
          yna("e_2_5_1", "2.5.1", "*Formal Introduction to Regulatory Guidance (GMP, ISO, etc.)"),
          yna("e_2_5_2", "2.5.2", "*New Hire Program"),
          yna("e_2_5_3", "2.5.3", "*Specific training e.g., clean room or handling toxic, infectious or sensitising materials?"),
          yna("e_2_5_4", "2.5.4", "*Periodic assessment of practical effectiveness?"),
          yna("e_2_5_5", "2.5.5", "*Periodic refresher training programs for established employees?"),
          yna("e_2_5_6", "2.5.6", "*At the start of new product manufacturing?"),
          yna("e_2_5_7", "2.5.7", "*When new methods are used?"),
          yna("e_2_5_8", "2.5.8", "*Quality techniques for production people?"),
        ],
      },
      {
        number: "2.6",
        title: "Does your training program emphasise?",
        fields: [
          yna("e_2_6_1", "2.6.1", "*Product integrity?"),
          yna("e_2_6_2", "2.6.2", "*Hygiene?"),
          yna("e_2_6_3", "2.6.3", "*Cleanliness?"),
          yna("e_2_6_4", "2.6.4", "*Data integrity?"),
          yna("e_2_6_5", "2.6.5", "*Other?"),
          cont(text("e_2_6_5_spec", "2.6.5", "Please specify:", { wide: true })),
        ],
      },
      {
        title: "3. Facility and Utilities",
        fields: [
          f("choice", "e_3_1", "3.1", "*Were the premises designed or adapted for the present use?", {
            options: [
              { value: "designed", label: "designed" },
              { value: "adapted", label: "adapted" },
            ],
          }),
        ],
      },
      {
        number: "3.2",
        title: "Are there separate areas for?",
        fields: [
          yna("e_3_2_1", "3.2.1", "*Handling of starting materials?", { bullet: true }),
          yna("e_3_2_2", "3.2.2", "*Manufacturing?", { bullet: true }),
          yna("e_3_2_3", "3.2.3", "*Quarantined finished products or are other control systems in place?", { bullet: true }),
          yna("e_3_2_4", "3.2.4", "*Approved finished products?", { bullet: true }),
          yna("e_3_2_5", "3.2.5", "*Packaging and dispatch?", { bullet: true }),
          yna("e_3_2_6", "3.2.6", "*Rest and eating?", { bullet: true }),
        ],
      },
      {
        number: "3.3",
        title: "Does the present design prevent?",
        fields: [
          yna("e_3_3_1", "3.3.1", "*Chemical contamination?", { bullet: true }),
          yna("e_3_3_2", "3.3.2", "*Physical contamination?", { bullet: true }),
          yna("e_3_3_3", "3.3.3", "*Microbial contamination?", { bullet: true }),
        ],
      },
      {
        number: "3.4",
        title: "Are your working-rooms:",
        fields: [
          yna("e_3_4_1", "3.4.1", "*Of proper size for the intended functions?", { bullet: true }),
          yna("e_3_4_2", "3.4.2", "*Satisfactorily lighted, air-conditioned?", { bullet: true }),
          yna("e_3_4_3", "3.4.3", "*Clean and cleaned-up?", { bullet: true }),
          yna("e_3_4_4", "3.4.4", "*Designed to avoid (cross-) contamination?", { bullet: true }),
          yna("e_3_4_5", "3.4.5", "*Supplied with security and fire protection measurements?", { bullet: true }),
        ],
      },
      {
        title: "",
        fields: [
          yna("e_3_5", "3.5", "*Do you have written Good House Keeping Procedures?"),
          yna("e_3_5_1", "3.5.1", "If yes, do you maintain follow- up records of these procedures?"),
          yna("e_3_6", "3.6", "*Do your manufacturing locations follow Good Manufacturing Practices?"),
          cont(ref("e_3_6_ref", "3.6", "If yes, provide GMP declaration.")),
          yna("e_3_7", "3.7", "*Are your sites inspected by the FDA or EMA or national (health) authorities?"),
          yna("e_3_8", "3.8", "*Are plant supply pipelines identified and labelled?"),
          yna("e_3_9", "3.9", "*Do you monitor the quality of the water used to prepare standards and reagents?"),
          yna("e_3_10", "3.10", "*Do you monitor the quality of the water used during the manufacturing process?"),
        ],
      },
      {
        title: "4. Machines and Equipment",
        fields: [
          f("choice", "e_4_1", "4.1", "*Is the production line multipurpose or single purpose?", {
            options: [
              { value: "multi", label: "Multi" },
              { value: "single", label: "Single" },
            ],
          }),
          ref("e_4_1_1", "4.1.1", "*If multipurpose, what other products do you manufacture there?"),
          yna("e_4_2", "4.2", "*Is there a maintenance and preventative maintenance program for all pieces of equipment?"),
          yna("e_4_3", "4.3", "*Do you have written maintenance and calibration procedures for critical equipment?"),
          yna("e_4_4", "4.4", "*Can all critical apparatus and devices easily be recognised as such, e.g. by calibration stickers?"),
          yna("e_4_5", "4.5", "*Are these calibrations traceable back to national standards?"),
          yna("e_4_6", "4.6", "*Do you retain records of calibration as evidence of control?"),
          yna("e_4_7", "4.7", "*Is there a cleaning plan/procedure for production machines, equipment?"),
          yna("e_4_8", "4.8", "*Have the cleaning and sterilisation processes been validated?"),
          yna("e_4_9", "4.9", "*Is any manufacturing equipment software controlled?"),
          yna("e_4_10", "4.10", "*Do you have a documented procedure for the validation of all test and measuring equipment used to demonstrate the conformance of product to the specified requirements?"),
          yna("e_4_11", "4.11", "*Do you retain records of validation as evidence of control?"),
          label("e_4_11_1", "4.11.1", "If yes,"),
          cont(yna("e_4_11_1_validated", "4.11.1", "Is the software validated?", { bullet: true })),
          cont(yna("e_4_11_1_modifications", "4.11.1", "Are modifications of software (or its use) implemented by manufacturing personnel?", { bullet: true })),
          cont(yna("e_4_11_1_change", "4.11.1", "Is there a procedure concerning change of software and its copying?", { bullet: true })),
          cont(yna("e_4_11_1_security", "4.11.1", "Is the security of software controlled?", { bullet: true })),
          label("e_4_12", "4.12", "*Do you contract out any of the following services"),
          yna("e_4_12_1", "4.12.1", "*Instrument Calibration?"),
          yna("e_4_12_2", "4.12.2", "*Preventative / Breakdown Maintenance?"),
          yna("e_4_12_3", "4.12.3", "*Pest control?"),
        ],
      },
      {
        title: "5. Production and Process Control",
        fields: [
          yn("e_5_1", "5.1", "*Is your manufacturing process validated?"),
          yn("e_5_1_1", "5.1.1", "If not, do you have plans to do so?"),
          text("e_5_1_1_1", "5.1.1.1", "If you do: what is your target date for completion?"),
          text("e_5_2", "5.2", "*How do you define your lot/batch?"),
          text("e_5_3", "5.3", "*How and by whom are lot/batch numbers assigned?"),
          text("e_5_4", "5.4", "*What is your normal lot/batch size?"),
          yna("e_5_5", "5.5", "*Does each lot/batch have an identification number?"),
        ],
      },
      {
        number: "5.6",
        title: "If, for capacity reasons, you combine material coming from more than one particular piece or part of process equipment into one lot/batch:",
        fields: [
          yna("e_5_6_1", "5.6.1", "*Is the lot/batch being homogenised prior to packaging?"),
          yna("e_5_6_2", "5.6.2", "*Is the homogenisation operation validated?"),
        ],
      },
      {
        title: "",
        fields: [
          yna("e_5_7", "5.7", "*Do you manufacture according to a written procedure for each product supplied to the market?"),
          yna("e_5_8", "5.8", "*Are these procedures approved by QA?"),
          yna("e_5_9", "5.9", "*Do you have a batch record for each batch/lot manufactured?"),
          label("e_5_9_1", "5.9.1", "If yes, do the batch records detail the following:"),
          cont(yna("e_5_9_1_desc", "5.9.1", "Description, Lot Number & Quantities of Material used?", { bullet: true })),
          cont(yna("e_5_9_1_proc", "5.9.1", "Processing Conditions (Temperature, Times etc)?", { bullet: true })),
          cont(yna("e_5_9_1_person", "5.9.1", "The identification of the Person who performed the particular step?", { bullet: true })),
          cont(yna("e_5_9_1_ipc", "5.9.1", "Results of any In-process tests?", { bullet: true })),
          cont(yna("e_5_9_1_dev", "5.9.1", "All deviations from standard conditions?", { bullet: true })),
          cont(yna("e_5_9_1_clean", "5.9.1", "All cleaning operations carried out before & after batch manufacture?", { bullet: true })),
          text("e_5_9_2", "5.9.2", "If yes, for how long do you keep the batch records?"),
          yna("e_5_9_3", "5.9.3", "If yes, are these records formally checked and approved by QA?"),
          label("e_5_10", "5.10", "*Do you maintain lot separation during"),
          cont(yna("e_5_10_manufacturing", "5.10", "Manufacturing?", { bullet: true })),
          cont(yna("e_5_10_packaging", "5.10", "Packaging?", { bullet: true })),
          cont(yna("e_5_10_storage", "5.10", "Storage?", { bullet: true })),
          cont(yna("e_5_10_transportation", "5.10", "Transportation?", { bullet: true })),
          yna("e_5_11", "5.11", "*Do you maintain records of use, maintenance for process equipment, in order to demonstrate the traceability in batches, product processed and personnel?"),
          yna("e_5_12", "5.12", "*Are computers used to store records of manufacture, testing, storage or distribution for the product you supply?"),
          yna("e_5_12_1", "5.12.1", "If yes, have these computer systems been validated (i.e.. have the complete life cycles of the systems been assessed and documented including stages of planning, specifications, programming, testing, commissioning, documentation, operation, monitoring and modifying)?"),
          yna("e_5_13", "5.13", "*Do all product containers bear identification labels, e.g. stating batch/lot number, product name etc.?"),
          yna("e_5_14", "5.14", "*Is there expiry or retest dates defined for all material?"),
          cont(ref("e_5_14_ref", "5.14", "If yes, please provide the stability expiry data")),
          yna("e_5_15", "5.15", "*Is there storage conditions defined for all material?"),
          cont(ref("e_5_15_ref", "5.15", "If yes, provide the declaration for the storage and packing conditions")),
          yna("e_5_16", "5.16", "*Is the product identifiable throughout the manufacturing process?"),
          yna("e_5_17", "5.17", "*Is traceability of all raw materials used, maintained throughout manufacture?"),
          yna("e_5_18", "5.18", "*Is there a procedure in place to prevent cross-contamination?"),
          yna("e_5_19", "5.19", "*Are line clearances undertaken between product changes during manufacturing and labelling? (i.e. Where a variety of products are manufactured on one site, do you carry out an independent, recorded check, immediately prior to a production run to verify the areas are free from previous starting materials, products documentation and waste and that it is fit for use)?"),
          yna("e_5_20", "5.20", "*Do you use dedicated equipment for the production of the product in question?"),
          text("e_5_20_1", "5.20.1", "If no, please provide details of other product types manufactured using this equipment:"),
          yna("e_5_21", "5.21", "*Is testing or inspection performed between processes or manufacturing stages?"),
          yna("e_5_22", "5.22", "*Is testing or inspection performed on finished products?"),
          yna("e_5_23", "5.23", "*Are rejected lots identified as such and separated?"),
          yna("e_5_24", "5.24", "*Do you perform a failure investigation in case of a reject?"),
          yna("e_5_25", "5.25", "*Is reprocessing of rejected lots documented?"),
          yna("e_5_26", "5.26", "*Do you have a procedure covering rework/reprocessing or recovery of material?"),
          yna("e_5_27", "5.27", "*Is non-conforming final product ever blended with conforming product to bring it into specification?"),
          yna("e_5_28", "5.28", "*Is there a documented procedure that clearly defines when blending of non-conforming product is allowed?"),
          text("e_5_29", "5.29", "*How long do you keep the analytical and production records (number of years)?", { suffix: "Years" }),
          yna("e_5_30", "5.30", "*Do you have plant shutdowns (holidays, maintenance)?"),
          {
            id: "e_5_30_1",
            number: "5.30.1",
            kind: "checks",
            label: "If yes, which one(s)?",
            checks: [
              { id: "e_5_30_1_maintenance", label: "Maintenance" },
              { id: "e_5_30_1_holiday", label: "Holiday" },
            ],
          },
          yna("e_5_31", "5.31", "*Do you have manufacturing alternatives/fall back?"),
          label("e_5_32", "5.32", "*How many weeks of inventory do you have for the product(s) involved?"),
          text("e_5_32_1", "5.32.1", "Raw materials?", { bullet: true }),
          text("e_5_32_2", "5.32.2", "Semi-finished product?", { bullet: true }),
          text("e_5_32_3", "5.32.3", "Finished product?", { bullet: true }),
        ],
      },
    ],
    narrativeLabel: "Comments",
  },
  vq_section_f: {
    letter: "F",
    title: "Packaging Material",
    banner: "F. Packaging Material",
    instruction: VQ_VENDOR_INSTRUCTION,
    identity: true,
    materialHeader: {
      nameLabel: "Material Name / Brand Name",
      typeLabel: "Material Type",
    },
    groups: [
      {
        title: "1. *Packaging Information",
        fields: [
          label("f_1_1", "1.1", "Please provide a description of the material:"),
          cont(text("f_1_1_primary", "1.1", "Primary Packing Material")),
          cont(text("f_1_1_secondary", "1.1", "Secondary Packing Material")),
          cont(text("f_1_1_tertiary", "1.1", "Tertiary Packing Material")),
          cont(text("f_1_1_outer", "1.1", "Outer Most Container")),
          cont(text("f_1_1_other", "1.1", "Other packing materials / desiccants")),
          ref("f_1_2", "1.2", "Please provide an infra-red spectrum of the packaging material described above or food grade certificate"),
          label("f_1_3", "1.3", "Please confirm by signature that the packaging material described above fulfills all of the following criteria:"),
          cont(yna("f_1_3_a", "1.3", "a) Is BSE/TSE risk-related ingredients / materials used in the manufacture?")),
          cont(yna("f_1_3_b", "1.3", "b) Is it suitable for use in contact with foodstuffs?")),
          cont(yna("f_1_3_c", "1.3", "c) Is it in full compliance with Council Directive 1935/2004 relating to materials and articles intended to come into contact with foodstuffs, including its current amendments?")),
          cont(yna("f_1_3_d", "1.3", "d) Is primary packing material in compliance with Ph. Eur 3.1.3 and USP <661>")),
          cont(yna("f_1_3_e", "1.3", "e) Is it in full compliance with the relevant regulations of the BAG ?")),
          cont(yna("f_1_3_f", "1.3", "f) Is it in full compliance with the following relevant FDA regulations (please indicate applicable CFR references):")),
          cont(text("f_1_3_contamination", "1.3", "c) There are measures in place to avoid contamination of the product (particulate & microbial)", { wide: true })),
          cont(label("f_1_3_monographs", "1.3", "d) It is in full compliance with the requirements of the following monographs of the current edition of the European Pharmacopoeia indicated in chapter 3.1. Materials used for the manufacture of containers")),
          cont(f("check", "f_mono_30202", "1.3", "Monograph number 30202:", { bullet: true, detail: "3.2.2. Plastic containers and closures for pharmaceutical use" })),
          cont(f("check", "f_mono_30103", "1.3", "Monograph number 30103:", { bullet: true, detail: "3.1.3. Polyolefines" })),
          cont(f("check", "f_mono_30111", "1.3", "Monograph number 30111:", { bullet: true, detail: "3.1.11. Materials based on non-plasticized poly (vinyl chloride) for containers for dry dosage forms for oral administration" })),
          cont(f("check", "f_mono_30113", "1.3", "Monograph number 30113:", { bullet: true, detail: "3.1.13. Plastic additives" })),
        ],
      },
    ],
    narrativeLabel: "Comments",
  },
  vq_section_g: {
    letter: "G",
    title: "Elemental Impurities Questionnaire",
    banner: "G. *Elemental Impurities Questionnaire",
    instruction: VQ_VENDOR_INSTRUCTION,
    groups: [],
    matrix: {
      headers: [
        "S. No",
        "Name of the Elemental Impurity",
        "Source of elemental impurity (Raw material, Catalyst, wear and tear of equipment)",
        "Risk Assessment Report No",
        "Is elemental impurity controlled in final material?",
        "Appendix No",
      ],
      minRows: 8,
    },
    narrativeLabel: "Conclusion",
  },
  vq_section_h: {
    letter: "H",
    title: "Residual Solvent Questionnaire",
    banner: "H. *Residual Solvent Questionnaire",
    instruction: VQ_VENDOR_INSTRUCTION,
    groups: [],
    matrix: {
      headers: [
        "S. No",
        "Name of solvent used in process",
        "Residual Solvent declaration",
        "Is solvent controlled in final material as per ICH?",
        "Appendix No",
      ],
      minRows: 8,
    },
    narrativeLabel: "Conclusion",
  },
  vq_section_i: {
    letter: "I",
    title: "Potential Genotoxic Impurity (PGI) Questionnaire",
    banner: "I. *Potential Genotoxic Impurity (PGI) Questionnaire",
    instruction: VQ_VENDOR_INSTRUCTION,
    groups: [],
    matrix: {
      headers: [
        "S. No",
        "Name of PGI",
        "Source of PGI (Raw Material, Process By-product, Degradant)",
        "Risk Assessment Report No",
        "Is PGI’s controlled in final material?",
        "Appendix No",
      ],
      minRows: 7,
    },
    narrativeLabel: "Conclusion",
  },
  vq_section_j: {
    letter: "J",
    title: "Nitrosamine Impurity Questionnaire",
    banner: "J. *Nitrosamine Impurity Questionnaire",
    instruction: VQ_VENDOR_INSTRUCTION,
    groups: [],
    matrix: {
      headers: [
        "S. No",
        "Name of Nitrosamine",
        "Source of nitrosamine (NDSRI, Raw Material, Process By-product, Degradant)",
        "Risk Assessment Report No",
        "Is nitrosamine controlled in final material?",
        "Appendix No",
      ],
      minRows: 9,
    },
    narrativeLabel: "Conclusion",
  },
  vq_section_k: {
    letter: "K",
    title: "Willingness to Inspection",
    banner: "K. Willingness to inspection",
    groups: [
      {
        title: "",
        note: "A signed Declaration for Inspection shall be attached as an attachment along with this Vendor Qualification document. (Refer Attachment I)",
        wideChoices: true,
        naLabel: "NA",
        fields: [
          yna("k_declaration", "", "Is duly signed declaration inplace?"),
          yna("k_inspected", "", "Has vendor site been inspected by regulatory authorities such as the FDA, EDQM, TGA, etc.?"),
        ],
      },
    ],
    narrativeLabel: "Conclusion",
  },
  vq_section_l: {
    letter: "L",
    title: "Change Notification",
    banner: "L. Change Notification",
    groups: [
      {
        title: "",
        note: "Any change proposal related to the product, process, equipment, or facility shall be communicated to the customer, and it must be approved by the customer before implementation. (Refer Attachment II)",
        wideChoices: true,
        naLabel: "NA",
        fields: [
          yna("l_signed", "", "Is duly signed Change proposal inplace?"),
          yna("l_disagreement", "", "Is there any disagreement from the customer, and has it been resolved?"),
        ],
      },
    ],
    narrativeLabel: "Conclusion",
  },
  vq_section_m: {
    letter: "M",
    title: "Quality Agreement",
    banner: "M. Quality Agreement",
    groups: [
      {
        title: "",
        note: "A signed Quality agreement shall be attached as an attachment along with this Vendor Qualification document upon completion of assessment.",
        wideChoices: true,
        naLabel: "NA",
        fields: [
          yna("m_qa", "", "Is duly signed Quality Agreement inplace?"),
          yna("m_ta", "", "Is mutually agreed Technical Agreement inplace?"),
          yna("m_cda", "", "Is mutually agreed Confidential Disclosure Agreement (CDA) inplace?"),
        ],
      },
      {
        title: "9. Summary of vendor assessment:",
        note: SUMMARY_NOTE,
        noteShaded: true,
        placement: "vendor_completion",
        fields: [
          sectionTicks(
            "m_done",
            ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
            "m_done_"
          ),
        ],
      },
      {
        title: "Completion Signatures:",
        placement: "vendor_completion",
        fields: [
          label("m_ops_heading", "", "Site Operations Lead Representative:"),
          text("m_ops_name", "", "Name (Print ):"),
          text("m_ops_position", "", "Position:"),
          text("m_ops_signature", "", "Signature:"),
          text("m_ops_date", "", "Date:"),
          label("m_qa_heading", "", "Head of Quality Assurance or representative; person who completed the questionnaire:"),
          text("m_qa_name", "", "Name (Print):"),
          text("m_qa_position", "", "Position:"),
          text("m_qa_signature", "", "Signature:"),
          text("m_qa_date", "", "Date:"),
          text("m_completion_conclusion", "", "Conclusion:", { wide: true }),
          text("m_completion_recommendation", "", "Recommendation:", { wide: true }),
        ],
      },
    ],
    narrativeLabel: "Conclusion",
  },
  vq_section_n: {
    letter: "N",
    title: "Audit Checklist",
    banner: "N. Audit Checklist",
    groups: [
      {
        title: "",
        note: "Upon completion of the vendor audit, the filled and completed checklist shall be attached to this Vendor Qualification document.",
        wideChoices: true,
        naLabel: "NA",
        fields: [
          yna("n_audited", "", "Has vendor site been audited by 3xper representative?"),
          yna("n_observation", "", "Is there any critical observation noticed in your manufacturing site?"),
          yna("n_risk", "", "Is risk assessment in place for audit observation?"),
          yna("n_capa", "", "Is CAPA identified and implemented by your manufacturing site?"),
          yna("n_gmp", "", "Does vendor manufacturing site comply the GMP requirement?"),
          yna("n_cda", "", "Is mutually agreed Confidential Disclosure Agreement (CDA) between external auditing body inplace?"),
        ],
      },
    ],
    narrativeLabel: "Conclusion",
    narrativeFirst: true,
    matrix: {
      title: "Audit CAPA Summary and Status",
      note: "Proposed CAPA details should be captured below, along with the target date and the status of the CAPA, indicating whether it is completed or not.",
      headers: ["CAPA #", "Target Date", "Completed (Yes/No)", "Comment"],
      minRows: 8,
      capa: true,
    },
    afterMatrix: [
      {
        title: "",
        fields: [
          text("n_capa_conclusion", "", "Conclusion:", { wide: true }),
        ],
      },
    ],
  },
  vq_scoring: {
    title: "Approval of Vendor Qualification (3xper Innoventure Ltd)",
    groups: [
      {
        title: "Interim Approval of Vendor Qualification: (3xper Innoventure Ltd)",
        placement: "interim_approval",
        fields: [
          text("interim_verified_name", "", "Document Verified by (Quality Assurance) — Name"),
          text("interim_verified_designation", "", "Document Verified by (Quality Assurance) — Designation"),
          text("interim_verified_sign", "", "Document Verified by (Quality Assurance) — Sign"),
          text("interim_verified_date", "", "Document Verified by (Quality Assurance) — Date"),
          text("interim_approved_name", "", "Vendor Approved by (Quality Assurance) — Name"),
          text("interim_approved_designation", "", "Vendor Approved by (Quality Assurance) — Designation"),
          text("interim_approved_sign", "", "Vendor Approved by (Quality Assurance) — Sign"),
          text("interim_approved_date", "", "Vendor Approved by (Quality Assurance) — Date"),
        ],
      },
      {
        title: "Summary of vendor Assessment:",
        note: SUMMARY_NOTE,
        fields: [
          sectionTicks("score_done", VQ_REQUIRED_SECTION_LETTERS, "score_done_"),
          yn("score_pre_assessment", "", "Is Pre assessment met the requirement?"),
          yn("score_qa_attached", "", "Is Quality Agreement in place and same attached?"),
          yn("score_audit_done", "", "Is audit completed and check list attached?"),
          yna("score_capa_ok", "", "Is CAPA acceptable for the given observations?"),
          yn("score_vq_met", "", "Is vendor qualification met the requirement?"),
          f("choice", "score_conclusion", "", "Conclusion", {
            options: [
              { value: "approved", label: "approved" },
              { value: "conditionally", label: "conditionally" },
              { value: "not_approved", label: "not approved" },
            ],
          }),
          text("score_recommendations", "", "Recommendations (if any):", { wide: true }),
        ],
      },
      {
        title: "Questionnaire scoring",
        fields: [
          text("score_total_questions", "", "Total questions"),
          text("score_total_mandatory", "", "Total mandatory fields"),
          text("score_total_answered", "", "Total answered fields"),
          {
            id: "score_band",
            kind: "checks",
            label: "Questionnaire Scoring",
            checks: [
              { id: "score_excellent", label: "Excellent" },
              { id: "score_good", label: "Good" },
              { id: "score_fair", label: "Fair" },
              { id: "score_poor", label: "Poor" },
            ],
          },
        ],
      },
      {
        title: "Final approval",
        fields: [
          text("final_assessed_name", "", "Vendor Qualification Document assessed by (Quality Assurance) — Name"),
          text("final_assessed_designation", "", "Vendor Qualification Document assessed by (Quality Assurance) — Designation"),
          text("final_assessed_sign", "", "Vendor Qualification Document assessed by (Quality Assurance) — Sign"),
          text("final_assessed_date", "", "Vendor Qualification Document assessed by (Quality Assurance) — Date"),
          text("final_approved_name", "", "Vendor Approved by (Quality Assurance) — Name"),
          text("final_approved_designation", "", "Vendor Approved by (Quality Assurance) — Designation"),
          text("final_approved_sign", "", "Vendor Approved by (Quality Assurance) — Sign"),
          text("final_approved_date", "", "Vendor Approved by (Quality Assurance) — Date"),
        ],
      },
    ],
    narrativeLabel: "Recommendation / conclusion",
  },
};

/** Every answer key a field writes (checks write one key per option). */
export function vqFieldAnswerIds(field: VqField): string[] {
  switch (field.kind) {
    case "checks":
      return (field.checks ?? []).map((option) => option.id);
    case "static":
    case "label":
      return [];
    case "grid": {
      const ids: string[] = [];
      for (let r = 0; r < (field.rows ?? 0); r++) {
        for (let c = 0; c < (field.columns?.length ?? 0); c++) {
          ids.push(vqGridCellId(field.id, r, c));
        }
      }
      return ids;
    }
    default:
      return [field.id];
  }
}

export function vqGridCellId(fieldId: string, row: number, col: number): string {
  return `${fieldId}__r${row}c${col}`;
}

export function fieldsForSection(key: string): VqField[] {
  const section = VQ_FORM[key];
  if (!section) return [];
  return [...section.groups, ...(section.afterMatrix ?? [])].flatMap(
    (group) => group.fields
  );
}
