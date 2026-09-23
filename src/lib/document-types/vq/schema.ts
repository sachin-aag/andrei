/**
 * QAD-SOP-MS-001-F04 — Vendor Qualification for KSM/KRM/Critical Raw Materials.
 * Numbering and wording follow the 3xper master form (48-page A4).
 */

export type VqChoice = "" | "yes" | "no" | "na";

export type VqFieldKind =
  | "text"
  | "textarea"
  | "yes_no"
  | "yes_no_na"
  | "yes_no_na_ref";

export type VqField = {
  id: string;
  number?: string;
  kind: VqFieldKind;
  label: string;
  required?: boolean;
};

export type VqGroup = {
  title: string;
  note?: string;
  fields: VqField[];
};

export type VqMatrixSpec = {
  headers: readonly string[];
};

export type VqFormSection = {
  letter?: string;
  title: string;
  instruction?: string;
  identity?: boolean;
  groups: VqGroup[];
  matrix?: VqMatrixSpec;
  narrativeLabel?: string;
};

/** Paper form stars live in `required`, not in the question text. */
export function stripVqLeadingStar(label: string): string {
  return label.replace(/^\*\s*/, "");
}

function f(
  id: string,
  number: string,
  label: string,
  kind: VqFieldKind,
  required = false
): VqField {
  return { id, number, kind, label: stripVqLeadingStar(label), required };
}

/** Editor / Word caption: `1.6.2 * Please give…` — one star, original casing. */
export function vqFieldCaption(field: VqField): string {
  const label = stripVqLeadingStar(field.label);
  const number = field.number?.trim() ? `${field.number} ` : "";
  const star = field.required ? "* " : "";
  return `${number}${star}${label}`;
}

function text(
  id: string,
  number: string,
  label: string,
  required = false
): VqField {
  return f(id, number, label, "text", required);
}

function area(
  id: string,
  number: string,
  label: string,
  required = false
): VqField {
  return f(id, number, label, "textarea", required);
}

function yn(
  id: string,
  number: string,
  label: string,
  required = false
): VqField {
  return f(id, number, label, "yes_no", required);
}

function yna(
  id: string,
  number: string,
  label: string,
  required = false
): VqField {
  return f(id, number, label, "yes_no_na", required);
}

function ynr(
  id: string,
  number: string,
  label: string,
  required = false
): VqField {
  return f(id, number, label, "yes_no_na_ref", required);
}

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

function originGroup(
  prefix: string,
  base: string,
  title: string
): VqGroup {
  return {
    title,
    fields: ORIGIN_ITEMS.map(([slug, label], i) =>
      ynr(`${prefix}_${slug}`, `${base}.${i + 1}`, label)
    ),
  };
}

export const VQ_FORM_NO = "QAD-SOP-MS-001-F04";
export const VQ_FORM_TITLE =
  "VENDOR QUALIFICATION FOR KSM/KRM/ CRITICAL RAW MATERIALS";
export const VQ_FORM_REVISION = "01";
export const VQ_SITE_ADDRESS = [
  "3xper Innoventure Ltd,",
  "Plot No. 53, Part 54 & 55,",
  "Palachur Village,",
  "Naidupeta SEZ – 524421",
].join(" ");

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

export const VQ_REQUIRED_SECTION_TITLES: Record<
  (typeof VQ_REQUIRED_SECTION_LETTERS)[number],
  string
> = {
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
  ["1.12", "Sulphur dioxide and sulphites at concentrations of more than 10 mg/kg or 10 mg/liter expressed as SO2"],
  ["1.13", "Lupine"],
  ["1.14", "Molluscs (gastropods, bivalves, cephalopods)"],
  ["1.15", "Maize and products thereof"],
  ["1.16", "Sugar (sucrose)"],
  ["1.17", "Benzoates"],
  ["1.18", "BHA/BHT"],
  ["1.19", "Cinnamon, Cocoa, Vanilla, Chicken, Yeast, Legumes (other than Peanut), Pulses, Coriander, Umbelliferae, Flavour (any artificial/natural), Glutamate (% if naturally occurring), Carrot"],
];

export const VQ_FORM: Record<string, VqFormSection> = {
  vq_cover: {
    title: "Cover — 3xper issuance",
    instruction:
      "The supply chain department (Purchase department) of 3xper shall obtain the vendor questionnaire (preassessment form) from the Quality Assurance department of 3xper and the requirement defined by the Quality Assurance department of 3xper.",
    groups: [
      {
        title: "Material and manufacturer",
        fields: [
          yn("cover_rm_ksm", "", "Key Starting Material (KSM)"),
          yn("cover_rm_crm", "", "Critical Raw Material (CRM)"),
          yn("cover_rm_krm", "", "Key Raw Material (KRM)"),
          text("cover_manufacturer", "", "Name of the Manufacturer", true),
          text("cover_material", "", "Name of the Material", true),
        ],
      },
      {
        title: "Sections required for this vendor",
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
        fields: [area("cover_remarks", "", "Remarks")],
      },
      {
        title: "3xper company contact (questionnaire recipient)",
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
    identity: true,
    groups: [
      {
        title: "Vendor section",
        fields: [
          text("a_filled_by", "", "To be filled by"),
          text("a_area", "", "Area/Products of interest"),
          text("a_material_name", "", "Material Name / Brand Name"),
          text("a_chemical_name", "", "Chemical Name"),
          text("a_material_code", "", "Material Code"),
          text("a_product_code", "", "Product Code"),
        ],
      },
      {
        title: "1.1 Company / Address Information",
        fields: [
          text("a_1_1_1", "1.1.1", "*Name of company", true),
          area("a_1_1_2", "1.1.2", "*Address", true),
          text("a_1_1_3", "1.1.3", "*Postcode", true),
          text("a_1_1_4", "1.1.4", "*Country", true),
          text("a_1_1_5", "1.1.5", "*Telephone number", true),
          text("a_1_1_6", "1.1.6", "*Fax number / email address", true),
          text("a_1_1_7", "1.1.7", "*Web address", true),
        ],
      },
      {
        title: "1.2 Is the address listed above the only site for production?",
        fields: [
          yn("a_1_2", "1.2", "Only production site?"),
          text("a_1_2_1", "1.2.1", "Name of company(s)"),
          area("a_1_2_2", "1.2.2", "Address"),
          text("a_1_2_3", "1.2.3", "Postcode"),
          text("a_1_2_4", "1.2.4", "Telephone number"),
          text("a_1_2_5", "1.2.5", "Fax number / email address"),
        ],
      },
      {
        title: "1.3 Is your company a subsidiary?",
        fields: [
          yn("a_1_3", "1.3", "Subsidiary?"),
          text("a_1_3_1", "1.3.1", "Name of company"),
          area("a_1_3_2", "1.3.2", "Address"),
          text("a_1_3_3", "1.3.3", "Postcode"),
          text("a_1_3_4", "1.3.4", "Telephone number"),
          text("a_1_3_5", "1.3.5", "Fax number / email address"),
        ],
      },
      {
        title: "1.4 Contact information",
        fields: [
          text("a_1_4_1", "1.4.1", "*Name", true),
          text("a_1_4_2", "1.4.2", "*Position", true),
          text("a_1_4_3", "1.4.3", "*Telephone number", true),
          text("a_1_4_4", "1.4.4", "*Fax number"),
          text("a_1_4_5", "1.4.5", "*Fax number / email address", true),
        ],
      },
      {
        title: "1.5 Site personnel information",
        fields: [
          text("a_1_5_1", "1.5.1", "*Approximate total number of employees at facility of interest", true),
          text("a_1_5_2", "1.5.2", "*Approximate number of employees in the Quality Unit (QA/QC)", true),
          text("a_1_5_3", "1.5.3", "*Approximate number of employees in Production/Operations Unit", true),
          ynr("a_1_5_4", "1.5.4", "If available, please enclose a copy of your Organisational chart indicating key personnel"),
          ynr("a_1_5_5", "1.5.5", "If available, could you please supply copies of any sales information for the products listed on the front of this form?"),
          yn("a_1_5_6", "1.5.6", "Does your factory operate in a shift system?"),
          text("a_1_5_7", "1.5.7", "How many shifts?"),
          text("a_1_5_8", "1.5.8", "How many days a week?"),
        ],
      },
      {
        title: "1.6 Company structure",
        fields: [
          area("a_1_6_1", "1.6.1", "*What is the legal ownership structure of your company?", true),
          ynr("a_1_6_2", "1.6.2", "*Please give a brief structure-diagram", true),
          yn("a_1_6_3", "1.6.3", "*Do you expect a change of the legal status and/or ownership of your company in the near future?", true),
          yn("a_1_6_4", "1.6.4", "*Do you have an annual report available?", true),
          ynr("a_1_6_5", "1.6.5", "If yes, please enclose the annual report / Sustainable report / declaration"),
        ],
      },
      originGroup(
        "a_2_1",
        "2.1",
        "2.1 Origin of the starting ingredient"
      ),
      originGroup(
        "a_2_2",
        "2.2",
        "2.2 Origin of the excipient/components and/or any material used in the manufacture"
      ),
      {
        title: "2.3 Additives / Stabilizers (if applicable)",
        fields: [
          yna("a_2_3", "2.3", "Additives / Stabilizers (if applicable)"),
          text("a_2_3_1", "2.3.1", "*Additive E Numbers / Name of the stabilizer", true),
          yna("a_2_3_2", "2.3.2", "*Other additives than colours and sweeteners (Dir. 95/2/EC* and subsequent amendments.)", true),
          yna("a_2_3_3", "2.3.3", "*Purity criteria (Dir. 96/77/EC* and subsequent amendments.)", true),
          yna("a_2_3_4", "2.3.4", "*Other relevant purity criteria applicable", true),
        ],
      },
      {
        title: "3. Quality Standards and Certifications",
        fields: [
          ynr("a_3_1", "3.1", "*Do you hold certification(s) against any recognized quality standards by an accredited third-party body e.g., ISO 9001, 14001 or 22000? If yes, please provide a copy of certificate(s).", true),
          ynr("a_3_2", "3.2", "*Do you hold accreditation, certification or registration by any regulatory agency or body? If yes, please provide a copy of documentation", true),
          ynr("a_3_3", "3.3", "*Are any aspects of the process / service provided subcontracted?", true),
          area("a_3_3_1", "3.3.1", "If so, please provide detail"),
          ynr("a_3_3_2", "3.3.2", "*Are there Quality / Technical Agreements held with subcontractors?", true),
        ],
      },
      {
        title: "4. Quality Management Documentation",
        note: "Do you have procedures that document how you perform the following activities? If ‘YES’ please provide the document reference number / identification/ Copy of ISO 9001 Certificate. In case you are certified towards ISO 9001, only 4.1.2, 4.1.7, 4.1.11, 4.2.1, 4.2.2, 4.4.1, 4.4.4 and 4.5.2 are mandatory.",
        fields: [
          ynr("a_4_1_1", "4.1.1", "*Quality Policy / Manual", true),
          ynr("a_4_1_2", "4.1.2", "*Equipment & Instrument Validation / Qualification Program", true),
          ynr("a_4_1_3", "4.1.3", "*Internal Audit / Self-inspection Program", true),
          ynr("a_4_1_4", "4.1.4", "*Supplier Evaluation / Qualification Program", true),
          ynr("a_4_1_5", "4.1.5", "*Does your company operate a supplier-auditing system?", true),
          ynr("a_4_1_6", "4.1.6", "*Training Program", true),
          ynr("a_4_1_7", "4.1.7", "*Change Control", true),
          ynr("a_4_1_8", "4.1.8", "*Deviation / Investigation Reporting", true),
          ynr("a_4_1_9", "4.1.9", "*Non-Conformance Reporting", true),
          ynr("a_4_1_10", "4.1.10", "*Documentation Control", true),
          ynr("a_4_1_11", "4.1.11", "*Do you have a recall system/procedure in place?", true),
          ynr("a_4_2_1", "4.2.1", "*Environmental Monitoring Program", true),
          ynr("a_4_2_2", "4.2.2", "*Housekeeping Program", true),
          ynr("a_4_2_3", "4.2.3", "*Gowning / Entry & Exit Procedure", true),
          ynr("a_4_2_4", "4.2.4", "*Availability of Master Production Instructions and Batch production Records", true),
          ynr("a_4_2_5", "4.2.5", "*Availability of Equipment Cleaning Procedures, Cleaning Records and Cleaning Verification", true),
          ynr("a_4_3_1", "4.3.1", "*Labelling of Intermediate / Final Products", true),
          ynr("a_4_3_2", "4.3.2", "*Storage of Intermediate / Final Products", true),
          ynr("a_4_3_3", "4.3.3", "Product / Sample Shipping Validation Program"),
          ynr("a_4_4_1", "4.4.1", "*Pest Control Program", true),
          ynr("a_4_4_2", "4.4.2", "*Preventive Maintenance Program", true),
          ynr("a_4_4_3", "4.4.3", "*Calibration Program", true),
          ynr("a_4_4_4", "4.4.4", "*Facility Cleaning / Sanitization", true),
          ynr("a_4_4_5", "4.4.5", "*Is equipment master list available? If yes, attach the Master List. If no, assessment summary report to be attached.", true),
          ynr("a_4_5_1", "4.5.1", "*Method Qualification for all assays used in Testing of Samples", true),
          ynr("a_4_5_2", "4.5.2", "*Testing Reagents and Standards Controls Policy / Procedure", true),
          ynr("a_4_5_3", "4.5.3", "*Sample Retention Program", true),
          ynr("a_4_5_4", "4.5.4", "*Out of Specification (OOS) / Retest Procedures", true),
          ynr("a_4_5_5", "4.5.5", "*Availability of Analytical Raw Data Documentation", true),
          ynr("a_4_5_6", "4.5.6", "*Is laboratory instrument master list available? If yes, attach the Master List. If no, assessment summary report to be attached.", true),
          ynr("a_4_6_1", "4.6.1", "*Materials Movement into the Facility", true),
          ynr("a_4_6_2", "4.6.2", "*Inventory Management System", true),
          ynr("a_4_6_3", "4.6.3", "*Warehouse System and Storage", true),
          ynr("a_4_6_4", "4.6.4", "*Is list of storage facility along with temperature condition available? If yes, attach the Master List. If no, assessment summary report to be attached.", true),
          ynr("a_4_6_5", "4.6.5", "*Inspection and Testing of Incoming Materials", true),
          ynr("a_4_7_1", "4.7.1", "*Contract Review", true),
          ynr("a_4_7_2", "4.7.2", "*Supply Chain Requirements", true),
          ynr("a_4_7_3", "4.7.3", "*Product Identification / Traceability", true),
        ],
      },
      {
        title: "5. Regulatory Compliance and History",
        fields: [
          yna("a_5_1", "5.1", "*Has the company been subject to periodic audit by competent authorities e.g., MHRA, EMA, FDA, ISO inspection body etc?", true),
          area("a_5_1_1", "5.1.1", "If ‘YES’ please provide details below for the past 3 years and attach certificate / supporting documents (Ref)"),
        ],
      },
      {
        title: "5.2 Regulatory Compliance (if YES applicable please tick the legislation you are compliant with)",
        fields: [
          ynr("a_5_2_1", "5.2.1", "*Mycotoxin (Regulation 1881/2006/EC and subsequent amendments)", true),
          ynr("a_5_2_2", "5.2.2", "*Dioxin (Regulation 1881/2006/EC and subsequent amendments)", true),
          ynr("a_5_2_3", "5.2.3", "*Ionisation", true),
          ynr("a_5_2_4", "5.2.4", "*Pesticide Residues", true),
          ynr("a_5_2_5", "5.2.5", "*Heavy Metals Specified", true),
          ynr("a_5_2_6", "5.2.6", "*Polycyclic Aromatic Hydrocarbons (PAH)", true),
          ynr("a_5_2_7", "5.2.7", "*Polychlorinated Biphenyls (PCBs)", true),
          ynr("a_5_2_8", "5.2.8", "*Nitrate", true),
          ynr("a_5_2_9", "5.2.9", "*BSE / TSE", true),
          ynr("a_5_2_10", "5.2.10", "*Product Data Sheet", true),
          ynr("a_5_2_11", "5.2.11", "*Safety Data Sheet", true),
        ],
      },
      {
        title: "6. Industry History",
        fields: [
          yna("a_6_1", "6.1", "*Do you supply to any other customer in the Pharmaceutical / Health care industry?", true),
          text("a_6_1_1", "6.1.1", "If ‘YES’, please specify the approximate % of your business that this relates to"),
          yna("a_6_2", "6.2", "*Have you been audited by any Pharmaceutical / Health care companies / Qualified Personnel (QP) within the last two years?", true),
        ],
      },
    ],
    matrix: {
      headers: ["Ref # (Attachment Number)", "Appendix / document title"],
    },
    narrativeLabel: "7. Comments",
  },
  vq_section_b: {
    letter: "B",
    title: "TSE/BSE Risk Analysis Survey",
    instruction:
      "The questionnaire should be completed by the Vendor, and an additional sheet may be used for any extra information.",
    identity: true,
    groups: [
      {
        title: "1. Production details",
        fields: [
          yn("b_1_1", "1.1", "*Is the product partially or fully of animal origin (i.e., tissue, tissue extract or fluid such as milk, serum, blood etc.)?", true),
          yn("b_1_2", "1.2", "*Does the manufacturing process involve any raw materials, source materials, or reagents that are of animal origin?", true),
          yn("b_1_3", "1.3", "*Is the product derived from microbiological or cell culture fermentations?", true),
          text("b_1_3_1", "1.3.1", "If yes, please indicate type"),
          yn("b_1_3_2", "1.3.2", "If yes, are any components used in the media culture derived from animal origin?"),
          yn("b_1_5", "1.5", "*Is the product purified using chromatography media (e.g., specific ligand columns) or buffers that contain components of animal origin?", true),
          yn("b_1_6", "1.6", "*Is any of the equipment used for processing or storage of the product in contact at any time with other materials of animal origin?", true),
          area("b_2_9", "2.9", "If yes please specify the process and indicate the stage(s) during the manufacture of the product at which it takes place"),
          ynr("b_2_10_attach", "2.10", "Please attach 1) a manufacturing process-outline or flow chart, and 2) a general description of the conditions applied at each manufacturing step"),
          yn("b_2_10", "2.10", "Is there a system in place at your company to verify for each lot of products and each lot of material used to manufacture your product that the above information is verified and documented?"),
          yn("b_2_11", "2.11", "Have you been granted a certificate of suitability by the EDQM (European Directorate for the Quality of Medicines)?"),
          ynr("b_2_11_1", "2.11.1", "If yes, please attach a copy of the certificate"),
          yn("b_2_12_2", "2.12.2", "If no, have you applied for or will you apply for a certificate of suitability?"),
        ],
      },
    ],
    narrativeLabel: "Comments",
  },
  vq_section_c: {
    letter: "C",
    title: "Traceability of Ingredients Potentially Derived from GMO",
    instruction:
      "In order to comply with current EU legislation on the labelling of foodstuffs containing genetically modified organisms (GMOs) and to trace any materials that have potentially been derived from GMO crops please complete the following questionnaire.",
    identity: true,
    groups: [
      {
        title: "1. Raw Material Origin",
        fields: [
          yn("c_1_1", "1.1", "Is the product supplied to us derived from maize grains, rice grains, soy beans, cotton seeds, sunflower seeds, rape seeds or sugar beet?"),
          area("c_1_2", "1.2", "In any case, please indicate plant species from which the raw material is derived"),
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
          text("c_2_2_a", "2.2 a", "All incoming batches"),
          text("c_2_2_b", "2.2 b", "Representative sampling technique"),
          yn("c_2_3", "2.3", "Is an independent laboratory used for PCR test?"),
        ],
      },
      {
        title: "3. Transportation and Storage",
        fields: [
          yn("c_3_1", "3.1", "Are the maize grain / rice grain / soy bean / cotton seed / sunflower seed / rape seed / sugar beet segregated (GM / non-GM) during transportation to factory (designated vessels / Lorries)?"),
          yn("c_3_3", "3.3", "Is the raw material stored in designated tanks / silos prior to processing?"),
          area("c_3_2", "3.2", "Describe the procedures taken to avoid cross contamination between GM / Non-GM material"),
        ],
      },
      {
        title: "4. Processing",
        fields: [
          yn("c_4_1", "4.1", "After initial processing is the crude material (oil, slurry, etc….) PCR tested?"),
          area("c_4_2", "4.2", "If no, describe the measures taken to avoid cross contamination (e.g., cleaning procedures)"),
          yn("c_4_3", "4.3", "Is a dedicated processing line used for GM / non-GM material?"),
        ],
      },
      {
        title: "5. Quality Control and Management Procedures",
        fields: [
          yn("c_5_1", "5.1", "Is batch traceability back to origin of seed"),
          yn("c_5_1_a", "5.1 a", "In place"),
          yn("c_5_1_b", "5.1 b", "Documented"),
          area("c_5_1_c", "5.1 c", "If no, please comment?"),
          ynr("c_5_1_d", "5.1 d", "If yes, please provide relevant documentation"),
          yn("c_5_2", "5.2", "Is PCR testing for GM carried out on the final product?"),
          text("c_5_3", "5.3", "Please indicate frequency of test"),
          text("c_5_3_a", "5.3 a", "Each batch"),
          text("c_5_3_b", "5.3 b", "Representative sampling technique (state) method"),
          yn("c_5_4", "5.4", "Are PCR analysis results available for each batch of this product (supplied or to be supplied)?"),
          yn("c_5_5", "5.5", "Are designated barrels / drums, tankers, Lorries used for transportation of the final product?"),
        ],
      },
    ],
    narrativeLabel: "Comments",
  },
  vq_section_d: {
    letter: "D",
    title: "Allergen",
    instruction:
      "The questionnaire should be completed by the vendor, and an additional sheet may be used for any extra information.",
    identity: true,
    groups: [
      {
        title: "1. Allergen — Does the product contain",
        fields: ALLERGENS.map(([number, label]) =>
          yn(`d_${number.replaceAll(".", "_")}`, number, label)
        ),
      },
      {
        title: "2. HACCP — Allergen Risk in Place (cross-contamination)",
        fields: [
          yn("d_2_1", "2.1", "Are processing aids containing substances causing hypersensitivity listed in section 1, used during the manufacturing process?"),
          area("d_2_1_1", "2.1.1", "If yes, which one(s)? (Please indicate ppm level, where applicable)"),
          yn("d_2_2", "2.2", "Can you exclude that the material contains any of the substances listed in section 1, due to unintended presence (e.g. cross-contact in the manufacturing site or during transportation, cross-contact / carry-over due to shared production lines, rework, dust, packaging, etc)?"),
          area("d_2_2_1", "2.2.1", "If yes, please give details (e.g. used raw materials are under control – audits, supplier’s questionnaires –, efficient validated wet cleaning, system based on HACCP which excludes unintended presence, etc)"),
          area("d_2_2_2", "2.2.2", "If no, please specify the reasons and for which substance(s) unintended presence is possible (please indicate ppm level, where applicable)"),
          ynr("d_2_3", "2.3", "Please provide us a Manufacturing Process Flow"),
          ynr("d_2_4", "2.4", "Please detail hereunder the exact Quantitative Product Composition"),
        ],
      },
    ],
    narrativeLabel: "Comments",
  },
  vq_section_e: {
    letter: "E",
    title: "Extended Quality Questionnaire",
    instruction:
      "The questionnaire should be completed by the vendor, and an additional sheet may be used for any extra information.",
    identity: true,
    groups: [
      {
        title: "1. General Information",
        fields: [
          yn("e_1_1", "1.1", "*Are customer audits and/or inspections by agencies permitted?", true),
          yn("e_1_3", "1.3", "*Is the decision to release or reject a product for sale independent from production?", true),
          text("e_1_4", "1.4", "*Who is signing the Certificate of Analysis (Analytical Report)", true),
          text("e_1_5", "1.5", "*Who is responsible for the final product release / reject?", true),
          text("e_1_6_name", "1.6", "*Who is responsible for contacts with us concerning quality matters? (Name)", true),
          text("e_1_6_pos", "1.6", "Position"),
          yn("e_1_7_bulk", "1.7", "*What kind of product do you manufacture — Bulk raw materials?"),
          yn("e_1_7_pharma", "1.7", "Bulk raw materials for pharmaceuticals?"),
          yn("e_1_7_api", "1.7", "Active pharmaceutical ingredients?"),
          yn("e_1_7_tech", "1.7", "Technical products?"),
          yn("e_1_7_pack", "1.7", "Packaging material?"),
          yn("e_1_7_other", "1.7", "Others?"),
          area("e_1_7_specify", "1.7", "Please, specify"),
        ],
      },
      {
        title: "2. Quality systems — other",
        fields: [
          yna("e_2_6_5", "2.6.5", "*Other?"),
          text("e_2_6_5_spec", "2.6.5", "Please specify"),
        ],
      },
      {
        title: "3. Facility and Utilities",
        fields: [
          text("e_3_1", "3.1", "*Were the premises designed or adapted for the present use? (designed / adapted)", true),
          yna("e_3_2_1", "3.2.1", "*Handling of starting materials?", true),
          yna("e_3_2_2", "3.2.2", "*Manufacturing?", true),
          yna("e_3_2_3", "3.2.3", "*Quarantined finished products or are other control systems in place?", true),
          yna("e_3_2_4", "3.2.4", "*Approved finished products?", true),
          yna("e_3_2_5", "3.2.5", "*Packaging and dispatch?", true),
          yna("e_3_2_6", "3.2.6", "*Rest and eating?", true),
          yna("e_3_3_1", "3.3.1", "*Chemical contamination?", true),
          yna("e_3_3_2", "3.3.2", "*Physical contamination?", true),
          yna("e_3_3_3", "3.3.3", "*Microbial contamination?", true),
          yna("e_3_4_1", "3.4.1", "*Of proper size for the intended functions?", true),
          yna("e_3_4_2", "3.4.2", "*Satisfactorily lighted, air-conditioned?", true),
          yna("e_3_4_3", "3.4.3", "*Clean and cleaned-up?", true),
          yna("e_3_4_4", "3.4.4", "*Designed to avoid (cross-) contamination?", true),
          yna("e_3_4_5", "3.4.5", "*Supplied with security and fire protection measurements?", true),
          yna("e_3_5", "3.5", "*Do you have written Good House Keeping Procedures?", true),
        ],
      },
      {
        title: "5. Production / batch control",
        fields: [
          area("e_5_4", "5.4", "*What is your normal lot/batch size?", true),
          yna("e_5_5", "5.5", "*Does each lot/batch have an identification number?", true),
          yna("e_5_6_1", "5.6.1", "*Is the lot/batch being homogenised prior to packaging?", true),
          yna("e_5_6_2", "5.6.2", "*Is the homogenisation operation validated?", true),
          yna("e_5_7", "5.7", "*Do you manufacture according to a written procedure for each product supplied to the market?", true),
          yna("e_5_8", "5.8", "*Are these procedures approved by QA?", true),
          yna("e_5_9", "5.9", "*Do you have a batch record for each batch/lot manufactured?", true),
          yna("e_5_9_1_desc", "5.9.1", "Batch records detail — Description, Lot Number & Quantities of Material used?"),
          yna("e_5_9_1_proc", "5.9.1", "Processing Conditions (Temperature, Times etc)?"),
          yna("e_5_9_1_person", "5.9.1", "The identification of the Person who performed the particular step?"),
          yna("e_5_9_1_ipc", "5.9.1", "Results of any In-process tests?"),
          yna("e_5_9_1_dev", "5.9.1", "All deviations from standard conditions?"),
          yna("e_5_9_1_clean", "5.9.1", "All cleaning operations carried out before & after batch manufacture?"),
          text("e_5_9_2", "5.9.2", "If yes, for how long do you keep the batch records?"),
          text("e_5_29", "5.29", "*How long do you keep the analytical and production records (number of years)?", true),
          yna("e_5_30", "5.30", "*Do you have plant shutdowns (holidays, maintenance)?", true),
          text("e_5_30_1", "5.30.1", "If yes, which one(s)? (Maintenance / Holiday)"),
          yna("e_5_31", "5.31", "*Do you have manufacturing alternatives/fall back?", true),
          text("e_5_32_1", "5.32.1", "*How many weeks of inventory — Raw materials?", true),
          text("e_5_32_2", "5.32.2", "Semi-finished product?"),
          text("e_5_32_3", "5.32.3", "Finished product?"),
        ],
      },
    ],
    narrativeLabel:
      "Additional extended quality responses (use for remaining 2.x / 4.x / 5.x items from the master form)",
  },
  vq_section_f: {
    letter: "F",
    title: "Packaging Material",
    instruction:
      "The questionnaire should be completed by the vendor, and an additional sheet may be used for any extra information.",
    identity: true,
    groups: [
      {
        title: "1. Packaging Information",
        fields: [
          area("f_1_1_primary", "1.1", "Primary Packing Material"),
          area("f_1_1_secondary", "1.1", "Secondary Packing Material"),
          area("f_1_1_tertiary", "1.1", "Tertiary Packing Material"),
          area("f_1_1_outer", "1.1", "Outer Most Container"),
          area("f_1_1_other", "1.1", "Other packing materials / desiccants"),
          ynr("f_1_2", "1.2", "Please provide an infra-red spectrum of the packaging material described above or food grade certificate"),
          yna("f_1_3_a", "1.3 a", "Is BSE/TSE risk-related ingredients / materials used in the manufacture?"),
          yna("f_1_3_b", "1.3 b", "Is it suitable for use in contact with foodstuffs?"),
        ],
      },
    ],
    narrativeLabel: "Comments",
  },
  vq_section_g: {
    letter: "G",
    title: "Elemental Impurities Questionnaire",
    instruction:
      "The questionnaire should be completed by the vendor, and an additional sheet may be used for any extra information.",
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
    },
    narrativeLabel: "Conclusion",
  },
  vq_section_h: {
    letter: "H",
    title: "Residual Solvent Questionnaire",
    instruction:
      "The questionnaire should be completed by the vendor, and an additional sheet may be used for any extra information.",
    groups: [],
    matrix: {
      headers: [
        "S. No",
        "Name of solvent used in process",
        "Residual Solvent declaration",
        "Is solvent controlled in final material as per ICH?",
        "Appendix No",
      ],
    },
    narrativeLabel: "Conclusion",
  },
  vq_section_i: {
    letter: "I",
    title: "Potential Genotoxic Impurity (PGI) Questionnaire",
    instruction:
      "The questionnaire should be completed by the vendor, and an additional sheet may be used for any extra information.",
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
    },
    narrativeLabel: "Conclusion",
  },
  vq_section_j: {
    letter: "J",
    title: "Nitrosamine Impurity Questionnaire",
    instruction:
      "The questionnaire should be completed by the vendor, and an additional sheet may be used for any extra information.",
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
    },
    narrativeLabel: "Conclusion",
  },
  vq_section_k: {
    letter: "K",
    title: "Willingness to Inspection",
    instruction:
      "A signed Declaration for Inspection shall be attached as an attachment along with this Vendor Qualification document. (Refer Attachment I)",
    groups: [
      {
        title: "Declaration",
        fields: [
          yna("k_declaration", "", "Is duly signed declaration in place?"),
          yna("k_inspected", "", "Has vendor site been inspected by regulatory authorities such as the FDA, EDQM, TGA, etc.?"),
        ],
      },
    ],
    narrativeLabel: "Conclusion",
  },
  vq_section_l: {
    letter: "L",
    title: "Change Notification",
    instruction:
      "Any change proposal related to the product, process, equipment, or facility shall be communicated to the customer, and it must be approved by the customer before implementation. (Refer Attachment II)",
    groups: [
      {
        title: "Change control",
        fields: [
          yna("l_signed", "", "Is duly signed Change proposal in place?"),
          yna("l_disagreement", "", "Is there any disagreement from the customer, and has it been resolved?"),
        ],
      },
    ],
    narrativeLabel: "Conclusion",
  },
  vq_section_m: {
    letter: "M",
    title: "Quality Agreement",
    instruction:
      "A signed Quality agreement shall be attached as an attachment along with this Vendor Qualification document upon completion of assessment.",
    groups: [
      {
        title: "Agreements in place",
        fields: [
          yna("m_qa", "", "Is duly signed Quality Agreement in place?"),
          yna("m_ta", "", "Is mutually agreed Technical Agreement in place?"),
          yna("m_cda", "", "Is mutually agreed Confidential Disclosure Agreement (CDA) in place?"),
        ],
      },
      {
        title: "Vendor declaration signatories",
        fields: [
          text("m_ops_name", "", "Site Operations Lead Representative — Name (Print)"),
          text("m_ops_position", "", "Position"),
          text("m_ops_date", "", "Date"),
          text("m_qa_name", "", "Head of Quality Assurance or representative — Name (Print)"),
          text("m_qa_position", "", "Position"),
          text("m_qa_date", "", "Date"),
        ],
      },
    ],
    narrativeLabel: "Conclusion",
  },
  vq_section_n: {
    letter: "N",
    title: "Audit Checklist",
    instruction:
      "Upon completion of the vendor audit, the filled and completed checklist shall be attached to this Vendor Qualification document.",
    groups: [
      {
        title: "Audit",
        fields: [
          yna("n_audited", "", "Has vendor site been audited by 3xper representative?"),
          yna("n_observation", "", "Is there any critical observation noticed in your manufacturing site?"),
          yna("n_risk", "", "Is risk assessment in place for audit observation?"),
          yna("n_capa", "", "Is CAPA identified and implemented by your manufacturing site?"),
          yna("n_gmp", "", "Does vendor manufacturing site comply the GMP requirement?"),
          yna("n_cda", "", "Is mutually agreed Confidential Disclosure Agreement (CDA) between external auditing body in place?"),
        ],
      },
    ],
    matrix: {
      headers: [
        "CAPA #",
        "Target Date",
        "Completed (Yes/No)",
        "Comment",
      ],
    },
    narrativeLabel: "Conclusion",
  },
  vq_scoring: {
    title: "Approval of Vendor Qualification (3xper Innoventure Ltd)",
    instruction:
      "Excellent: All mandatory questions answered + all optional questions answered. Good: All mandatory questions are answered, and most optional questions are completed with relevant attachments. Fair: Only mandatory questions answered. Poor: Mandatory questions not fully answered — the questionnaire will be rejected and returned to SCM.",
    groups: [
      {
        title: "Questionnaire scoring",
        fields: [
          text("score_total_questions", "", "Total questions"),
          text("score_total_mandatory", "", "Total mandatory fields"),
          text("score_total_answered", "", "Total answered fields"),
          yn("score_excellent", "", "Excellent"),
          yn("score_good", "", "Good"),
          yn("score_fair", "", "Fair"),
          yn("score_poor", "", "Poor"),
        ],
      },
      {
        title: "Interim approval",
        fields: [
          text("interim_verified_name", "", "Document Verified by (Quality Assurance) — Name"),
          text("interim_verified_designation", "", "Designation"),
          text("interim_verified_date", "", "Date"),
          text("interim_approved_name", "", "Vendor Approved by (Quality Assurance) — Name"),
          text("interim_approved_designation", "", "Designation"),
          text("interim_approved_date", "", "Date"),
        ],
      },
      {
        title: "Final approval",
        fields: [
          text("final_assessed_name", "", "Vendor Qualification Document assessed by (Quality Assurance) — Name"),
          text("final_assessed_designation", "", "Designation"),
          text("final_assessed_date", "", "Date"),
          text("final_approved_name", "", "Vendor Approved by (Quality Assurance) — Name"),
          text("final_approved_designation", "", "Designation"),
          text("final_approved_date", "", "Date"),
        ],
      },
    ],
    narrativeLabel: "Recommendation / conclusion",
  },
};

export function fieldsForSection(key: string): VqField[] {
  const section = VQ_FORM[key];
  if (!section) return [];
  return section.groups.flatMap((group) => group.fields);
}
