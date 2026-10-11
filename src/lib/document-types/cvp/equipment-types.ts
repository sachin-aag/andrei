/**
 * 15.N equipment-box recipes from the Stage-5 cleaning validation report.
 * Add equipment picks a type; on-read upgrade classifies existing boxes.
 */
export const CVP_EQUIPMENT_TYPES = [
  "reactor",
  "sparkler",
  "centrifuge",
  "rvd",
  "mill",
  "sifter",
  "other",
] as const;

export type CvpEquipmentType = (typeof CVP_EQUIPMENT_TYPES)[number];

export const CVP_EQUIPMENT_TYPE_LABELS: Record<CvpEquipmentType, string> = {
  reactor: "Glass lined reactor",
  sparkler: "Sparkler filter",
  centrifuge: "Centrifuge",
  rvd: "Roto cone vacuum drier",
  mill: "Multi mill",
  sifter: "Sifter",
  other: "Other",
};

export const CVP_EQUIPMENT_TYPE_OPTIONS: ReadonlyArray<{
  value: CvpEquipmentType;
  label: string;
}> = CVP_EQUIPMENT_TYPES.map((value) => ({
  value,
  label: CVP_EQUIPMENT_TYPE_LABELS[value],
}));

const TYPE_FROM_ID: ReadonlyArray<{ pattern: RegExp; type: CvpEquipmentType }> =
  [
    {
      pattern:
        /\bGLR\b|\bglass\s*lined\s*reactor\b|\bSSR\b|\bstainless\s*steel\s*reactor\b/i,
      type: "reactor",
    },
    { pattern: /\bSF\b|\bsparkler\b/i, type: "sparkler" },
    { pattern: /\bCF\b|\bcentrifuge\b/i, type: "centrifuge" },
    { pattern: /\bRVD\b|\bRCVD\b|\broto\s*cone\b/i, type: "rvd" },
    { pattern: /\bMM\b|\bmulti\s*mill\b/i, type: "mill" },
    { pattern: /\bSR\b|\bsifter\b/i, type: "sifter" },
  ];

export function isCvpEquipmentType(value: unknown): value is CvpEquipmentType {
  return (
    typeof value === "string" &&
    (CVP_EQUIPMENT_TYPES as readonly string[]).includes(value)
  );
}

export function classifyCvpEquipmentType(title: string): CvpEquipmentType {
  const text = title.replace(/\s+/g, " ").trim();
  for (const { pattern, type } of TYPE_FROM_ID) {
    if (pattern.test(text)) return type;
  }
  return "other";
}

export function cvpResidueHeadingTitle(
  type: CvpEquipmentType,
  ordinal: number
): string {
  const n = `15.${ordinal}.7`;
  if (type === "reactor" || type === "sparkler") {
    return `${n} Reflux, Swab & Rinse samples analysis results summary`;
  }
  return `${n} Swab & Rinse samples analysis results summary`;
}

export function cvpHasRefluxSampleRow(type: CvpEquipmentType): boolean {
  return type === "reactor";
}

export function cvpHasShellWallCalc(type: CvpEquipmentType): boolean {
  return type === "reactor";
}

export function cvpHasAgitatorIdentityRow(type: CvpEquipmentType): boolean {
  return type === "reactor";
}

/** Parameter | Acceptance Criteria / Target — Batch columns stay blank. */
export function cvpCleaningParameterRows(
  type: CvpEquipmentType
): readonly (readonly [string, string])[] {
  switch (type) {
    case "reactor":
      return [
        ["Water Quantity Used for flushing (L)", "As per approved cleaning SOP"],
        ["Acetone Quantity Used for flushing (L)", "As per approved cleaning SOP"],
        ["Observed level of adhered material", "Minimal"],
        ["Water quantity used for reflux (L)", "Minimum 150"],
        ["Water Heating Temperature (°C)", "NA"],
        ["Water Heating Time (Min)", "NA"],
        ["Water Contact / reflux Time (Min)", "30-40"],
        ["Water Cooling Temperature (°C)", "Below 40"],
        ["Water Cooling Time (Min)", "NA"],
        ["Water cleaning cycle time", "NA"],
        ["Acetone Quantity Used (L)", "Minimum 100"],
        ["Acetone Heating Temperature (°C) (if applicable)", "NA"],
        ["Acetone Contact / Reflux Time (Min)", "30-40"],
        ["Acetone Cooling Temperature (°C)", "Below 35"],
        ["Acetone Cooling Time (Min)", "NA"],
        ["Acetone cleaning cycle time", "NA"],
        ["Total Cleaning Cycle Time (Min)", "NA"],
        ["Rinse volume of acetone (L)", ""],
        ["Rinse operation time (Min)", "NA"],
      ];
    case "sparkler":
      return [
        ["Water Quantity Used for gasket washing (L)", ""],
        ["Water Quantity Used for flushing (L) using spray jet", ""],
        ["Acetone Quantity Used for flushing (L)", ""],
        ["Total Cleaning Cycle Time (Min)", "NA"],
        ["Rinse volume of acetone (L)", ""],
        ["Rinse operation time (Min)", "NA"],
      ];
    case "centrifuge":
      return [
        ["Water Quantity Used for flushing hoses (L)", ""],
        ["Acetone Quantity used for flushing hoses (L)", ""],
        ["Water Quantity Used for cleaning the CF bag (L)", ""],
        ["Bag soaking duration in water (min)", ""],
        ["Acetone Quantity Used for cleaning the CF bag (L)", ""],
        ["Bag soaking duration in Acetone (min)", ""],
        ["Observed level of adhered material on bag", "Minimal"],
        ["Water Quantity Used for centrifuge cleaning (L)", ""],
        ["Water cleaning cycle time (min)", "NA"],
        ["Acetone Quantity Used for centrifuge cleaning (L)", ""],
        ["Acetone cleaning cycle time (min)", "NA"],
        ["Observed level of adhered material", "Minimal"],
        ["Rinse volume of acetone (L) for CF", ""],
        ["Rinse volume of acetone (L) for MLT", ""],
      ];
    case "rvd":
      return [
        ["Water quantity used for gasket washing (L)", ""],
        ["Water Quantity Used for RVD cleaning (L)", ""],
        ["- rotation with water", ""],
        ["- flushing", ""],
        ["Observed level of adhered material", "Minimal"],
        ["Water cleaning cycle time (hh:mm)", "NA"],
        ["Acetone Quantity Used (L)", ""],
        ["Acetone Heating Temperature (°C) (if applicable)", "NA"],
        ["Acetone Contact Time (Min)", ""],
        ["Acetone Cooling Temperature (°C)", ""],
        ["Acetone Cooling Time (Min)", "NA"],
        ["Acetone cleaning cycle time (hh:mm)", "NA"],
        ["Total Cleaning Cycle Time (hh:mm)", "NA"],
        ["Rinse volume of acetone (L)", ""],
        ["Rinse operation time (Min)", "NA"],
      ];
    case "mill":
      return millOrSifterRows("multi mill");
    case "sifter":
      return millOrSifterRows("sifter");
    case "other":
      return [];
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown CVP equipment type: ${String(exhaustive)}`);
    }
  }
}

function millOrSifterRows(
  name: "multi mill" | "sifter"
): readonly (readonly [string, string])[] {
  return [
    ["Water used for gasket cleaning (L)", ""],
    [`Water used for cleaning of all ${name} parts (L)`, ""],
    [`Acetone used for cleaning and flushing of all ${name} parts (L)`, ""],
    ["Water cleaning cycle time (hh:mm)", "NA"],
    ["Acetone cleaning cycle time (hh:mm)", "NA"],
    ["Total Cleaning Cycle Time (hh:mm)", "NA"],
    ["Acetone rinse volume (L)", ""],
    ["Rinsing time (hh:mm)", "NA"],
  ];
}

export function cvpResidueSampleRows(
  type: CvpEquipmentType
): readonly (readonly string[])[] {
  const swab = "NMT 2 ppm";
  const rows: string[][] = [];
  if (cvpHasRefluxSampleRow(type)) {
    rows.push(["Reflux Sample (Acetone)", "NA", "For information", "", "", ""]);
  }
  if (type === "centrifuge") {
    rows.push(["Final Rinse Sample (Acetone) in CF", "NA", "", "", "", ""]);
    rows.push(["Final Rinse Sample (Acetone) in MLT", "NA", "", "", "", ""]);
  } else {
    rows.push(["Final Rinse Sample (Acetone)", "NA", "", "", "", ""]);
  }
  rows.push(["Swab samples", "", "", "", "", ""]);
  rows.push(["", "", swab, "", "", ""]);
  return rows;
}
