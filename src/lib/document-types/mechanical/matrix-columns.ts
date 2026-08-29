import type { MatrixColumnSchema } from "@/lib/document-types/design-verification/matrix-columns";

export type UutColumnId =
  | "equipment"
  | "manufacturer"
  | "partNumber"
  | "serialNumber"
  | "revision";

export type MechanicalResultsColumnId =
  | "requirementId"
  | "requirementDescription"
  | "notesResults"
  | "passFail";

export type RevisionHistoryColumnId =
  | "revisionLevel"
  | "revisionDate"
  | "changeOrderNo"
  | "description"
  | "author";

/** Table 1 (2.3 Units Under Test) — systems and assemblies, not instruments. */
export const UUT_COLUMN_SCHEMA: readonly MatrixColumnSchema<UutColumnId>[] = [
  {
    id: "equipment",
    label: "Equipment",
    aliases: ["equipment", "unit", "assembly", "item", "description", "name"],
  },
  {
    id: "manufacturer",
    label: "Manufacturer",
    aliases: ["manufacturer", "mfr", "make", "vendor", "supplier"],
  },
  {
    id: "partNumber",
    label: "Part Number",
    aliases: [
      "part number",
      "part no",
      "part no.",
      "p n",
      "pn",
      "cd part number",
      "controlled part number",
    ],
    inferFromContent: "idLike",
  },
  {
    id: "serialNumber",
    label: "Serial Number",
    aliases: ["serial number", "serial no", "serial no.", "serial", "s n", "sn"],
  },
  {
    id: "revision",
    label: "Revision",
    aliases: ["revision", "rev", "rev.", "rev level", "revision level"],
  },
];

/**
 * Tables 3 and 4 (4.2 Requirements Verified). Same four roles as the software
 * report's matrix, but Convergent's mechanical reports head the evidence column
 * "Notes/Results" and the verdict column "Pass/Fail".
 */
export const MECHANICAL_RESULTS_COLUMN_SCHEMA: readonly MatrixColumnSchema<MechanicalResultsColumnId>[] =
  [
    {
      id: "requirementId",
      label: "Req ID",
      aliases: [
        "req id",
        "req. id",
        "requirement id",
        "requirement",
        "req",
        "req no",
        "requirement no",
      ],
      inferFromContent: "idLike",
    },
    {
      id: "requirementDescription",
      label: "Requirement Description",
      aliases: [
        "requirement description",
        "req description",
        "req. description",
        "description",
        "requirement text",
      ],
    },
    {
      id: "notesResults",
      label: "Notes/Results",
      aliases: [
        "notes results",
        "notes/results",
        "notes",
        "results",
        "notes and results",
        "satisfied by",
        "evidence",
      ],
    },
    {
      id: "passFail",
      label: "Pass/Fail",
      aliases: ["pass fail", "pass/fail", "p f", "p/f", "verdict", "status"],
      inferFromContent: "passFail",
    },
  ];

/** Table 5 — revision history. */
export const REVISION_HISTORY_COLUMN_SCHEMA: readonly MatrixColumnSchema<RevisionHistoryColumnId>[] =
  [
    {
      id: "revisionLevel",
      label: "Revision Level",
      aliases: ["revision level", "revision", "rev level", "rev", "level"],
    },
    {
      id: "revisionDate",
      label: "Revision Date",
      aliases: ["revision date", "date", "release date", "rev date"],
    },
    {
      id: "changeOrderNo",
      label: "DCO/ECO Number",
      aliases: [
        "dco eco number",
        "dco/eco number",
        "dco eco",
        "dco/eco",
        "dco number",
        "eco number",
        "change order",
        "change order number",
      ],
      inferFromContent: "idLike",
    },
    {
      id: "description",
      label: "Description of Revision",
      aliases: [
        "description of revision",
        "description",
        "revision description",
        "change description",
      ],
    },
    {
      id: "author",
      label: "Revision Author",
      aliases: ["revision author", "author", "revised by", "prepared by"],
    },
  ];
