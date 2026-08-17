import type {
  ProtocolCheckPolicy,
  ProtocolParserConfig,
} from "@/lib/design-inputs/types";

/**
 * Convergent document-family overlay: ID shape, datasheet markers, J-codes,
 * instrument lexicon, and this-revision disposition exceptions.
 *
 * Product IDs belong here and in the Solea oracle — never in check bodies or
 * CriterionDefinition text.
 */
export const CONFIG = {
  TOP_00017_LCD2: "TOP-00017 LCD-2",
  TOP_00017_PCON: "TOP-00017 PCON",
  TOP_00051: "TOP-00051",
} as const;

export type JCode = "J1" | "J2" | "J3" | "J4" | "J5" | "J6" | "J7" | "J8";

export type JCodeDefinition = {
  code: JCode;
  requiredConfigs: string[];
  description: string;
};

export const J_CODES: Record<JCode, JCodeDefinition> = {
  J1: {
    code: "J1",
    requiredConfigs: [],
    description:
      "Satisfied entirely by software; no hardware dependency. Execute once on any configuration.",
  },
  J2: {
    code: "J2",
    requiredConfigs: [],
    description:
      "Hardware-dependent but identical on TOP-00017 and TOP-00051. Execute once on any configuration.",
  },
  J3: {
    code: "J3",
    requiredConfigs: [],
    description: "Applies to only one of the platforms.",
  },
  J4: {
    code: "J4",
    requiredConfigs: [CONFIG.TOP_00017_LCD2],
    description: "Only relevant to TOP-00017 with LCD-2.",
  },
  J5: {
    code: "J5",
    requiredConfigs: [CONFIG.TOP_00017_PCON, CONFIG.TOP_00051],
    description:
      "Applies to PCON and is specific to laser firing. Tested on TOP-00017 with PCON and on TOP-00051.",
  },
  J6: {
    code: "J6",
    requiredConfigs: [CONFIG.TOP_00017_PCON],
    description:
      "Applies to PCON, but is not specific to laser firing. Can be tested once on either a TOP-00017 with PCON or on TOP-00051.",
  },
  J7: {
    code: "J7",
    requiredConfigs: [
      CONFIG.TOP_00017_LCD2,
      CONFIG.TOP_00017_PCON,
      CONFIG.TOP_00051,
    ],
    description:
      "Applies to laser firing, and must be tested on all applicable laser controller configurations.",
  },
  J8: {
    code: "J8",
    requiredConfigs: [CONFIG.TOP_00017_PCON],
    description: "Needs to be tested on TOP-00017 with PCON only.",
  },
};

export function isJCode(value: string): value is JCode {
  return value in J_CODES;
}

export function requiredConfigsFor(jCode: string): string[] {
  if (!isJCode(jCode)) return [];
  return J_CODES[jCode].requiredConfigs;
}

export const C1_CORROBORATION = {
  doc: "790-00134R Rev U Observations",
  quote:
    "requirement SW-SIB-4 was listed in the test plan as applying to both TOP-00017 and TOP-00051 PCON laser controller configurations, but is actually specific to the LCD-2 laser controller (TOP-00017 only). As a result, this requirement was tested on the TOP-00017 with LCD-2 configuration only.",
};

export const C2_CORROBORATION = {
  doc: "790-00134R Rev U Deviation #11",
  quote:
    "The E-150 laser is not capable of sending the same status signals as the CX15 laser. This requirement is only applicable to Solea systems with a CX-15 laser module installed (TOP-00051). This requirement should be dependent on laser type and not laser controller type.",
};

export const CONVERGENT_PROTOCOL_CONFIG: ProtocolParserConfig = {
  requirementId: /SW-[A-Z]+-\d+(?:\.\d+)*/,
  requirementIdLine: /^(\s*)(SW-[A-Z]+-\d+(?:\.\d+)*)\b(.*)$/,
  family: /^(SW-[A-Z]+)/,
  removed: /\[Removed in\s+[Rr]ev\.?\s*([A-Za-z]+)\s*\]/,
  deferred: /\[Deferred to future SW release\]/i,
  revHistoryMarker: "2.1    SW Requirements - Rev History",
  applicabilityRules: [
    {
      pattern: /CX-15 lasers only/i,
      impliedConfigs: [CONFIG.TOP_00051],
    },
    {
      pattern: /both LCD and PCON|LCD and PCON/i,
      impliedConfigs: [
        CONFIG.TOP_00017_LCD2,
        CONFIG.TOP_00017_PCON,
        CONFIG.TOP_00051,
      ],
    },
    {
      pattern: /LCD only/i,
      impliedConfigs: [CONFIG.TOP_00017_LCD2],
    },
    {
      pattern: /PCON only/i,
      impliedConfigs: [CONFIG.TOP_00017_PCON, CONFIG.TOP_00051],
    },
  ],
  plan: {
    releaseHeadings: [
      {
        release: "4.7.0",
        heading: /2\.2\s+Scope[^\n]*Software Version 4\.7\.0/,
      },
      {
        release: "4.7.1",
        heading: /2\.3\s+Scope[^\n]*Software Version 4\.7\.1/,
      },
    ],
    firmwareStop: /2\.\d\s+Scope[^\n]*Firmware|2\.7\s+Scope/,
    jCodeLineEnd: /\b(J[1-8])\s*$/,
    ignoreLine: /^\s*Exception:/i,
    requiredConfigsFor,
  },
  protocol: {
    requirementsMarker: /^REQUIREMENTS\s*$/m,
    testingMethodsMarker: /^TESTING METHODS\s*$/m,
    sectionEndMarker: /Section End/,
    titleBeforeRequirements: true,
    documentNoPattern: /\b(\d{3}-\d{5})\b/g,
  },
  instrumentLexicon: [
    "ophir",
    "manometer",
    "keyboard",
    "breakout",
    "winlase",
    "service utility",
    "regedit",
    "pattern calculator",
    "721-00120",
  ],
  tilde: /~\s*[\d.]+/g,
  nonNormative: {
    na: /\bN\/A\b/g,
    should: /\bshould\b/gi,
    ifNeeded: /if needed|if applicable|if required/gi,
    appropriate: /\b(appropriate|reasonable|sufficient|adequate)\b/gi,
  },
};

export const CONVERGENT_CHECK_POLICY: ProtocolCheckPolicy = {
  confirmationIds: new Set(["SW-LWB-4"]),
  corroborations: {
    "SW-SIB-4": C1_CORROBORATION,
    "SW-WLP-10.2": C2_CORROBORATION,
  },
};

export function convergentCheckRunOptions() {
  return {
    policy: CONVERGENT_CHECK_POLICY,
    config: CONVERGENT_PROTOCOL_CONFIG,
  };
}

export { impliedConfigsFromNote } from "@/lib/design-inputs/applicability";
