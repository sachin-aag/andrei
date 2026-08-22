import type { MatrixColumnSchema } from "@/lib/document-types/design-verification/matrix-columns";

export type EquipmentColumnId =
  | "equipment"
  | "manufacturer"
  | "modelPartNo"
  | "assetTag"
  | "calibrationDue";

export type ResultsColumnId =
  | "requirementId"
  | "requirementDescription"
  | "satisfiedBy"
  | "passFail";

export const EQUIPMENT_COLUMN_SCHEMA: readonly MatrixColumnSchema<EquipmentColumnId>[] =
  [
    {
      id: "equipment",
      label: "Equipment",
      aliases: ["equipment", "instrument", "device", "name"],
    },
    {
      id: "manufacturer",
      label: "Manufacturer",
      aliases: ["manufacturer", "mfr", "make", "vendor", "supplier"],
    },
    {
      id: "modelPartNo",
      label: "Model/Part No.",
      aliases: [
        "model part no",
        "model/part no",
        "model part no.",
        "model",
        "part no",
        "part number",
        "model no",
        "model number",
        "catalog",
      ],
    },
    {
      id: "assetTag",
      label: "CD Asset Tag / Serial No.",
      aliases: [
        "cd asset tag serial no",
        "cd asset tag / serial no",
        "cd asset tag",
        "asset tag",
        "serial no",
        "serial number",
        "serial",
        "asset id",
        "tag",
      ],
      inferFromContent: "idLike",
    },
    {
      id: "calibrationDue",
      label: "Calibration Due",
      aliases: [
        "calibration due",
        "cal due",
        "calibration date",
        "cal date",
        "due date",
        "next calibration",
      ],
    },
  ];

export const RESULTS_COLUMN_SCHEMA: readonly MatrixColumnSchema<ResultsColumnId>[] =
  [
    {
      id: "requirementId",
      label: "Req ID",
      aliases: [
        "req id",
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
      label: "Req Description",
      aliases: [
        "req description",
        "requirement description",
        "description",
        "requirement text",
        "design input",
      ],
    },
    {
      id: "satisfiedBy",
      label: "Satisfied By",
      aliases: [
        "satisfied by",
        "satisfies",
        "test method",
        "method",
        "evidence",
        "verification method",
      ],
    },
    {
      id: "passFail",
      label: "P/F",
      aliases: [
        "p f",
        "p/f",
        "pass fail",
        "pass/fail",
        "verdict",
        "status",
      ],
      inferFromContent: "passFail",
    },
  ];
