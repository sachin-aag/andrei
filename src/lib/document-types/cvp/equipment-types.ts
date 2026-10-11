/**
 * 15.N equipment-box recipes. Shared types prefer the Stage-5 report
 * catalog; protocol-only types (vessel, PFR, ANF, ANFD, leaf filter)
 * come from the Stage-4 protocol.
 */
export const CVP_EQUIPMENT_TYPES = [
  "reactor",
  "ssr",
  "vessel",
  "pfr",
  "sparkler",
  "centrifuge",
  "rvd",
  "mill",
  "sifter",
  "anf",
  "anfd",
  "leaf_filter",
  "other",
] as const;

export type CvpEquipmentType = (typeof CVP_EQUIPMENT_TYPES)[number];

export const CVP_EQUIPMENT_TYPE_LABELS: Record<CvpEquipmentType, string> = {
  reactor: "Glass lined reactor",
  ssr: "Stainless steel reactor",
  vessel: "Mixed vessel",
  pfr: "Plug flow reactor",
  sparkler: "Sparkler filter",
  centrifuge: "Centrifuge",
  rvd: "Roto cone vacuum drier",
  mill: "Multi mill",
  sifter: "Sifter",
  anf: "Agitated Nutsche filter",
  anfd: "Agitated Nutsche filter cum drier",
  leaf_filter: "Leaf filter",
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
      pattern: /\bANFD\b|\bagitated\s*nutsche\s*filter\s*cum\s*drier\b/i,
      type: "anfd",
    },
    {
      pattern: /\bANF\b|\bagitated\s*nutsche\s*filter\b/i,
      type: "anf",
    },
    { pattern: /\bLF\b|\bleaf\s*filter\b/i, type: "leaf_filter" },
    { pattern: /\bMV\b|\bmixed\s*vessel\b/i, type: "vessel" },
    { pattern: /\bPFR\b|\bplug\s*flow\b/i, type: "pfr" },
    {
      pattern: /\bSSR\b|\bstainless\s*steel\s*reactor\b/i,
      type: "ssr",
    },
    {
      pattern: /\bGLR\b|\bglass\s*lined\s*reactor\b/i,
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

/** GLR and SSR share shell-calc, reflux, agitator, and S-1–S-7 swabs. */
export function cvpIsReactorFamily(type: CvpEquipmentType): boolean {
  return type === "reactor" || type === "ssr";
}

export function cvpResidueHeadingTitle(
  type: CvpEquipmentType,
  ordinal: number
): string {
  const n = `15.${ordinal}.7`;
  if (cvpIsReactorFamily(type) || type === "sparkler") {
    return `${n} Reflux, Swab & Rinse samples analysis results summary`;
  }
  return `${n} Swab & Rinse samples analysis results summary`;
}

export function cvpHasRefluxSampleRow(type: CvpEquipmentType): boolean {
  return cvpIsReactorFamily(type);
}

export function cvpHasShellWallCalc(type: CvpEquipmentType): boolean {
  return cvpIsReactorFamily(type) || type === "vessel";
}

export function cvpHasAgitatorIdentityRow(type: CvpEquipmentType): boolean {
  return (
    cvpIsReactorFamily(type) ||
    type === "vessel" ||
    type === "anf" ||
    type === "anfd"
  );
}

/** Parameter | Acceptance Criteria / Target — Batch columns stay blank. */
export function cvpCleaningParameterRows(
  type: CvpEquipmentType
): readonly (readonly [string, string])[] {
  switch (type) {
    case "reactor":
    case "ssr":
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
    case "vessel":
      return [
        ["Water Quantity Used for flushing (L)", "As per approved cleaning SOP"],
        ["Observed level of adhered material", "Minimal"],
        ["Water quantity used for reflux (L)", ""],
        ["Water Heating Temperature (°C)", "NA"],
        ["Water Heating Time (Min)", "NA"],
        ["Water Contact / Recirculation Time (Min)", ""],
        ["Water Cooling Temperature (°C)", ""],
        ["Water Cooling Time (Min)", "NA"],
        ["Water cleaning cycle time", "NA"],
        ["Acetone Quantity Used (L)", "As per approved cleaning SOP"],
        ["Acetone Heating Temperature (°C) (if applicable)", "NA"],
        ["Acetone Contact / Recirculation Time (Min)", ""],
        ["Acetone Cooling Temperature (°C)", ""],
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
    case "pfr":
    case "anf":
    case "anfd":
    case "leaf_filter":
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

export type CvpSwabLocation = {
  id: string;
  description: string;
};

export type CvpSwabRationale = {
  id: string;
  description: string;
  rationale: string;
  samples: string;
};

const SWAB = "NMT 2 ppm";
const BLANK_SWAB_LOCATION_COUNT = 6;

const REACTOR_LOCATIONS: readonly CvpSwabLocation[] = [
  { id: "S-1", description: "Reactor top dish near manhole" },
  { id: "S-2", description: "Reactor bottom side inner surface" },
  { id: "S-3", description: "Manhole lid seating area" },
  { id: "S-4", description: "Reactor's stirrer middle location" },
  { id: "S-5", description: "Reactor's stirrer blade" },
  { id: "S-6", description: "Bottom discharge valve" },
  { id: "S-7", description: "Thermowell bottom" },
];

/** 3 horizontal levels × 4 circumferential positions. One row per measurement. */
const REACTOR_SHELL_LEVELS = [
  { level: 1, idBase: 8, place: "bottom" },
  { level: 2, idBase: 9, place: "middle" },
  { level: 3, idBase: 10, place: "top" },
] as const;

const REACTOR_SHELL_LETTERS = ["a", "b", "c", "d"] as const;

export type CvpShellMeasurement = {
  id: string;
  description: string;
};

export function cvpReactorShellMeasurements(): readonly CvpShellMeasurement[] {
  const rows: CvpShellMeasurement[] = [];
  for (const level of REACTOR_SHELL_LEVELS) {
    for (const letter of REACTOR_SHELL_LETTERS) {
      const id = `S-${level.idBase}${letter}`;
      rows.push({
        id,
        description: `Shell wall Level ${level.level} (${id})`,
      });
    }
  }
  return rows;
}

function reactorShellRationale(): CvpSwabRationale[] {
  return REACTOR_SHELL_LEVELS.map((level) => {
    const ids = REACTOR_SHELL_LETTERS.map(
      (letter) => `S-${level.idBase}${letter}`
    );
    return {
      id: ids.join(", "),
      description: `Shell wall at ${level.place} level (0°, 90°, 180°, 270°)`,
      rationale: `Representative vessel shell wall sampling at the ${level.place} level.`,
      samples: "4",
    };
  });
}

const REACTOR_RATIONALE: readonly CvpSwabRationale[] = [
  {
    id: "S-1",
    description: "Reactor top dish near manhole",
    rationale:
      "Product contact surface. Hard to clean (overhead surface, shadowed from direct spray). Potential for splash and residue deposition.",
    samples: "1",
  },
  {
    id: "S-2",
    description: "Reactor bottom side inner surface",
    rationale:
      "Product contact surface. Product accumulation (lowest point). Hard to reach. Likely worst-case for residue retention.",
    samples: "1",
  },
  {
    id: "S-3",
    description: "Manhole lid seating area",
    rationale:
      "Hard to clean (gasket and crevice). Seam and joint geometry. Potential for residue entrapment.",
    samples: "1",
  },
  {
    id: "S-4",
    description: "Reactor's stirrer middle location",
    rationale: "Product contact. Hard to reach. Irregular shape.",
    samples: "1",
  },
  {
    id: "S-5",
    description: "Reactor's stirrer blade",
    rationale:
      "Product contact surface. Hard to reach. Irregular shape (blade and hub junction). Potential spray shadow.",
    samples: "1",
  },
  {
    id: "S-6",
    description: "Bottom discharge valve",
    rationale:
      "Product contact surface. Hard to clean. Seam and gasket. Lowest point, flow dead-leg potential.",
    samples: "1",
  },
  {
    id: "S-7",
    description: "Thermowell bottom",
    rationale:
      "Product contact surface. Dead-end pocket at the thermal interface.",
    samples: "1",
  },
  ...reactorShellRationale(),
];

const SPARKLER_LOCATIONS: readonly CvpSwabLocation[] = [
  { id: "S-1", description: "Sparkler filter bottom inner side surface" },
  { id: "S-2", description: "Sparkler filter dome side walls" },
  { id: "S-3", description: "Discharge nozzle" },
  { id: "S-4a", description: "Any two filter plates" },
  { id: "S-4b", description: "Any two filter plates" },
];

const SPARKLER_RATIONALE: readonly CvpSwabRationale[] = [
  {
    id: "S-1",
    description: "Sparkler filter bottom inner side surface",
    rationale: "Product contact.",
    samples: "1",
  },
  {
    id: "S-2",
    description: "Sparkler filter dome side walls",
    rationale: "Product contact.",
    samples: "1",
  },
  {
    id: "S-3",
    description: "Discharge nozzle",
    rationale: "Product contact. Hard to clean. Hard to reach. Uneven surface.",
    samples: "1",
  },
  {
    id: "S-4a & S-4b",
    description: "Any two filter plates",
    rationale: "Product contact. Hard to clean. Uneven surface.",
    samples: "2",
  },
];

const CENTRIFUGE_LOCATIONS: readonly CvpSwabLocation[] = [
  { id: "S-1", description: "Centrifuge top lid / Adjacent area" },
  {
    id: "S-2",
    description: "Centrifuge basket side wall location / Adjacent area",
  },
  { id: "S-3", description: "Bottom discharge valve / Adjacent area" },
  { id: "S-4", description: "ML Tank" },
];

const CENTRIFUGE_RATIONALE: readonly CvpSwabRationale[] = [
  {
    id: "S-1",
    description: "Centrifuge top lid / Adjacent area",
    rationale:
      "Product-contact surface with potential residue deposition during centrifugation operations.",
    samples: "1",
  },
  {
    id: "S-2",
    description: "Centrifuge basket side wall location / Adjacent area",
    rationale:
      "Product-contact surface with irregular geometry that may promote residue retention.",
    samples: "1",
  },
  {
    id: "S-3",
    description: "Bottom discharge valve / Adjacent area",
    rationale:
      "Critical product-contact area; difficult to clean and access due to complex configuration.",
    samples: "1",
  },
  {
    id: "S-4",
    description: "ML Tank",
    rationale:
      "Difficult-to-clean and difficult-to-reach product-contact surface with potential for residue carryover.",
    samples: "1",
  },
];

const RVD_LOCATIONS: readonly CvpSwabLocation[] = [
  { id: "S-1", description: "RVD inner wall (charging side)" },
  { id: "S-2", description: "RVD inner wall (discharge side)" },
  { id: "S-3", description: "Discharge port" },
];

const RVD_RATIONALE: readonly CvpSwabRationale[] = [
  {
    id: "S-1",
    description: "RVD inner wall (charging side)",
    rationale:
      "Product-contact surface with potential residue deposition during charging operations.",
    samples: "1",
  },
  {
    id: "S-2",
    description: "RVD inner wall (discharge side)",
    rationale:
      "Product-contact surface with potential residue accumulation during discharge operations.",
    samples: "1",
  },
  {
    id: "S-3",
    description: "Discharge port",
    rationale:
      "Product-contact surface containing seams and irregular geometries that are difficult to clean.",
    samples: "1",
  },
];

const MILL_LOCATIONS: readonly CvpSwabLocation[] = [
  { id: "S-1", description: "Inner surface of miller chute (opposite sides)" },
  { id: "S-2", description: "Miller mesh" },
  { id: "S-3", description: "Miller feeding chute" },
];

const MILL_RATIONALE: readonly CvpSwabRationale[] = [
  {
    id: "S-1",
    description: "Inner surface of miller chute (opposite sides)",
    rationale:
      "Product-contact surface with potential for residue carryover during material transfer.",
    samples: "1",
  },
  {
    id: "S-2",
    description: "Miller mesh",
    rationale:
      "Product-contact surface with a high potential for residue carryover. The mesh configuration makes it difficult to clean.",
    samples: "1",
  },
  {
    id: "S-3",
    description: "Miller feeding chute",
    rationale:
      "Product-contact surface with potential for residue carryover. The chute geometry and accessibility limitations make it hard to clean.",
    samples: "1",
  },
];

const SIFTER_LOCATIONS: readonly CvpSwabLocation[] = [
  { id: "S-1", description: "Inner surface of the charging hopper" },
  { id: "S-2", description: "Surface of the deck nearby discharge" },
  { id: "S-3", description: "Product discharge port" },
  { id: "S-4", description: "Sifter mesh / screen" },
];

const SIFTER_RATIONALE: readonly CvpSwabRationale[] = [
  {
    id: "S-1",
    description: "Inner surface of the charging hopper",
    rationale:
      "Direct product-contact surface with potential for residue deposition during charging operations.",
    samples: "1",
  },
  {
    id: "S-2",
    description: "Surface of the deck nearby discharge",
    rationale:
      "Product-contact surface where material accumulates prior to discharge.",
    samples: "1",
  },
  {
    id: "S-3",
    description: "Product discharge port",
    rationale:
      "Product-contact surface exposed to continuous product flow and potential residue retention.",
    samples: "1",
  },
  {
    id: "S-4",
    description: "Sifter mesh / screen",
    rationale:
      "Critical product-contact surface with multiple openings and crevices that make cleaning difficult.",
    samples: "1",
  },
];

const VESSEL_LOCATIONS: readonly CvpSwabLocation[] = [
  { id: "S-1", description: "Vessel top dish near manhole" },
  { id: "S-2", description: "Vessel bottom side inner surface near discharge" },
  { id: "S-3", description: "Manhole lid seating area" },
  { id: "S-4", description: "Stirrer shaft, middle location" },
  { id: "S-5", description: "Stirrer blade" },
  { id: "S-6", description: "Bottom discharge valve" },
  { id: "S-7a", description: "Vessel shell wall (0°)" },
  { id: "S-7b", description: "Vessel shell wall (90°)" },
  { id: "S-7c", description: "Vessel shell wall (180°)" },
  { id: "S-7d", description: "Vessel shell wall (270°)" },
];

const VESSEL_RATIONALE: readonly CvpSwabRationale[] = [
  {
    id: "S-1",
    description: "Vessel top dish near manhole",
    rationale:
      "Product contact surface. Hard to clean (overhead surface, shadowed from direct spray). Potential for splash and residue deposition.",
    samples: "1",
  },
  {
    id: "S-2",
    description: "Vessel bottom side inner surface near discharge",
    rationale:
      "Product contact surface. Product accumulation (lowest point). Hard to reach. Likely worst-case for residue retention.",
    samples: "1",
  },
  {
    id: "S-3",
    description: "Manhole lid seating area",
    rationale:
      "Hard to clean (gasket and crevice). Seam and joint geometry. Potential for residue entrapment.",
    samples: "1",
  },
  {
    id: "S-4",
    description: "Stirrer shaft, middle location",
    rationale: "Product contact. Hard to reach. Irregular shape.",
    samples: "1",
  },
  {
    id: "S-5",
    description: "Stirrer blade",
    rationale:
      "Product contact surface. Hard to reach. Irregular shape (blade and hub junction). Potential spray shadow.",
    samples: "1",
  },
  {
    id: "S-6",
    description: "Bottom discharge valve",
    rationale:
      "Product contact surface. Hard to clean. Seam and gasket. Lowest point, flow dead-leg potential.",
    samples: "1",
  },
  {
    id: "S-7a, S-7b, S-7c, S-7d",
    description: "Vessel shell wall (positions per 15.N.3.2)",
    rationale:
      "Product contact surface. Representative of the largest contact area. Additional levels follow the shell-wall calculation.",
    samples: "4",
  },
];

function nutscheLocations(
  prefix: "ANF" | "ANFD"
): readonly CvpSwabLocation[] {
  return [
    { id: "S-1", description: `${prefix} agitator` },
    { id: "S-2", description: `${prefix} filter mesh` },
    { id: "S-3", description: `${prefix} discharge port` },
    { id: "S-4", description: `${prefix} ML tank inner surface` },
    { id: "S-5a", description: `${prefix} inner shell surface - 0°` },
    { id: "S-5b", description: `${prefix} inner shell surface - 90°` },
    { id: "S-5c", description: `${prefix} inner shell surface - 180°` },
    { id: "S-5d", description: `${prefix} inner shell surface - 270°` },
  ];
}

function nutscheRationale(prefix: "ANF" | "ANFD"): readonly CvpSwabRationale[] {
  return [
    {
      id: "S-1",
      description: `${prefix} agitator`,
      rationale:
        "Product-contact surface with complex geometry, welds, and junctions. The agitator is partially shielded during cleaning and may create spray-shadow areas.",
      samples: "1",
    },
    {
      id: "S-2",
      description: `${prefix} filter mesh`,
      rationale:
        "Critical product-contact filtration surface directly exposed to the product cake. The mesh contains fine openings and interstitial spaces that may retain residue.",
      samples: "1",
    },
    {
      id: "S-3",
      description: `${prefix} discharge port`,
      rationale:
        "Product-contact surface containing crevices, seals, and changes in geometry. Acts as the primary discharge pathway and may accumulate residue.",
      samples: "1",
    },
    {
      id: "S-4",
      description: `${prefix} ML tank inner surface`,
      rationale:
        "Product-contact surface receiving filtrate during operation. May be difficult to access for manual inspection and cleaning.",
      samples: "1",
    },
    {
      id: "S-5a to S-5d",
      description: "Shell wall at middle level (0°, 90°, 180°, 270°)",
      rationale:
        "Representative locations covering the largest product-contact surface area of the vessel.",
      samples: "4",
    },
  ];
}

const LEAF_FILTER_LOCATIONS: readonly CvpSwabLocation[] = [
  { id: "S-1", description: "Top dome inner surface near spray shadow area" },
  { id: "S-2", description: "Filter leaf center surface" },
  { id: "S-3", description: "Filter leaf edge/periphery" },
  { id: "S-4", description: "Leaf mesh to frame joint/weld" },
  { id: "S-5", description: "Header/manifold connection" },
  { id: "S-6", description: "Bottom cone lowest point" },
  { id: "S-7", description: "Outlet nozzle" },
  { id: "S-8", description: "Bottom discharge valve" },
  { id: "S-9a", description: "Internal shell wall at middle level (0°)" },
  { id: "S-9b", description: "Internal shell wall at middle level (180°)" },
];

const LEAF_FILTER_RATIONALE: readonly CvpSwabRationale[] = [
  {
    id: "S-1",
    description: "Top dome inner surface near spray shadow area",
    rationale:
      "Product-contact surface located in an overhead region that may receive reduced cleaning solution impingement.",
    samples: "1",
  },
  {
    id: "S-2",
    description: "Filter leaf center surface",
    rationale:
      "Primary filtration surface with direct and prolonged product contact during filtration. Potential for retention of fine particles.",
    samples: "1",
  },
  {
    id: "S-3",
    description: "Filter leaf edge/periphery",
    rationale:
      "Located at the boundary of the filtration surface where product cake may accumulate and cleaning flow may be less effective.",
    samples: "1",
  },
  {
    id: "S-4",
    description: "Leaf mesh to frame joint/weld",
    rationale:
      "Critical worst-case location containing welds, joints, and narrow interfaces that may entrap residues.",
    samples: "1",
  },
  {
    id: "S-5",
    description: "Header/manifold connection",
    rationale:
      "Product-contact area with complex geometry, internal passages, and weld connections. Potential hold-up point for filtrate.",
    samples: "1",
  },
  {
    id: "S-6",
    description: "Bottom cone lowest point",
    rationale:
      "Lowest point of the equipment where solids, slurry, and residual liquids tend to settle during filtration and draining.",
    samples: "1",
  },
  {
    id: "S-7",
    description: "Outlet nozzle",
    rationale:
      "Product-contact transfer pathway with reduced accessibility and potential for residue retention due to changes in flow path.",
    samples: "1",
  },
  {
    id: "S-8",
    description: "Bottom discharge valve",
    rationale:
      "Critical worst-case location containing seals, internal cavities, and potential dead-leg areas.",
    samples: "1",
  },
  {
    id: "S-9a, S-9b",
    description: "Internal shell wall",
    rationale:
      "Representative locations covering the major product-contact surface area.",
    samples: "2",
  },
];

const EMPTY_SWABS: readonly CvpSwabLocation[] = [];
const EMPTY_RATIONALE: readonly CvpSwabRationale[] = [];

/** Named reactor residue rows (descriptions). Prefer `cvpSwabLocations`. */
export const CVP_REACTOR_SWAB_LOCATION_SEEDS = REACTOR_LOCATIONS.map(
  (location) => location.description
);

export function cvpSwabLocations(
  type: CvpEquipmentType
): readonly CvpSwabLocation[] {
  switch (type) {
    case "reactor":
    case "ssr":
      return REACTOR_LOCATIONS;
    case "vessel":
      return VESSEL_LOCATIONS;
    case "sparkler":
      return SPARKLER_LOCATIONS;
    case "centrifuge":
      return CENTRIFUGE_LOCATIONS;
    case "rvd":
      return RVD_LOCATIONS;
    case "mill":
      return MILL_LOCATIONS;
    case "sifter":
      return SIFTER_LOCATIONS;
    case "anf":
      return nutscheLocations("ANF");
    case "anfd":
      return nutscheLocations("ANFD");
    case "leaf_filter":
      return LEAF_FILTER_LOCATIONS;
    case "pfr":
    case "other":
      return EMPTY_SWABS;
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown CVP equipment type: ${String(exhaustive)}`);
    }
  }
}

export function cvpSwabRationaleRows(
  type: CvpEquipmentType
): readonly CvpSwabRationale[] {
  switch (type) {
    case "reactor":
    case "ssr":
      return REACTOR_RATIONALE;
    case "vessel":
      return VESSEL_RATIONALE;
    case "sparkler":
      return SPARKLER_RATIONALE;
    case "centrifuge":
      return CENTRIFUGE_RATIONALE;
    case "rvd":
      return RVD_RATIONALE;
    case "mill":
      return MILL_RATIONALE;
    case "sifter":
      return SIFTER_RATIONALE;
    case "anf":
      return nutscheRationale("ANF");
    case "anfd":
      return nutscheRationale("ANFD");
    case "leaf_filter":
      return LEAF_FILTER_RATIONALE;
    case "pfr":
    case "other":
      return EMPTY_RATIONALE;
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown CVP equipment type: ${String(exhaustive)}`);
    }
  }
}

export function cvpResidueSampleRows(
  type: CvpEquipmentType
): readonly (readonly string[])[] {
  const rows: string[][] = [];
  if (cvpHasRefluxSampleRow(type)) {
    rows.push(["Reflux Sample (Acetone)", "NA", "For information", "", "", ""]);
  }
  if (type === "rvd") {
    rows.push(["Heated acetone sample", "NA", "For information", "", "", ""]);
  }
  if (type === "centrifuge") {
    rows.push(["Final Rinse Sample (Acetone) in CF", "NA", "", "", "", ""]);
    rows.push(["Final Rinse Sample (Acetone) in MLT", "NA", "", "", "", ""]);
  } else {
    rows.push(["Final Rinse Sample (Acetone)", "NA", "", "", "", ""]);
  }
  const locations = cvpSwabLocations(type);
  if (locations.length === 0) {
    if (type === "other") {
      rows.push(["Swab samples", "", "", "", "", ""]);
      for (let i = 0; i < BLANK_SWAB_LOCATION_COUNT; i++) {
        rows.push(["", "", SWAB, "", "", ""]);
      }
    }
    return rows;
  }
  rows.push(["Swab samples", "", "", "", "", ""]);
  for (const location of locations) {
    rows.push([location.description, location.id, SWAB, "", "", ""]);
  }
  if (cvpIsReactorFamily(type)) {
    for (const measurement of cvpReactorShellMeasurements()) {
      rows.push([measurement.description, measurement.id, SWAB, "", "", ""]);
    }
  }
  return rows;
}
