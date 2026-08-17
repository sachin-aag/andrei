/**
 * Oracle transcribed from protocol-audit-790-00134-RevV.md, then checked
 * against the pdftotext fixtures. `removed` is 116 (every `[Removed in …]`
 * marker in 822-00007 Rev AC). The audit's 57 used a case-sensitive `rev`
 * regex and missed `[Removed in Rev. U]` / `Rev. AA`.
 */
export const EXPECTED = {
  parsedIds: 619,
  live: 503,
  removed: 116,
  deferred: 1,
  withTestRow: 496,
  declaredButUntested: [
    "SW-AS-3.1",
    "SW-SS-14",
    "SW-SO-4",
    "SW-UM-1.3",
    "SW-EL-1.1",
    "SW-SST-5.4",
  ],
  absentFromProtocol: ["SW-AR-5.15"],
  deferredOk: ["SW-DM-5"],
  dangling: [{ id: "SW-SO-4", via: "SW-AR-3.6" }],
  jCodeConflicts: [
    { id: "SW-SIB-4", disposition: "defect" as const },
    { id: "SW-WLP-10.2", disposition: "defect" as const },
    { id: "SW-LWB-4", disposition: "needs_confirmation" as const },
    { id: "SW-SIB-3", disposition: "defect" as const },
  ],
  ophirMissingFromTable2: true,
  obsoleteStillPresent: 0,
  blockCount: 47,
} as const;

export {
  C1_CORROBORATION,
  C2_CORROBORATION,
} from "@/lib/customers/convergent/protocol-config";

export const A1_BLOCKS: Record<string, { title: string; pages: string }> = {
  "SW-AS-3.1": {
    title: "Alignment State Specific Behavior",
    pages: "200–221",
  },
  "SW-SS-14": { title: "System Startup/Shutdown", pages: "57–64" },
  "SW-SO-4": { title: "Security: Authorization", pages: "73–79" },
  "SW-UM-1.3": { title: "Security: User Management", pages: "65–67" },
  "SW-EL-1.1": { title: "Error Log", pages: "123–125" },
  "SW-SST-5.4": { title: "System State Transitions", pages: "156–167" },
};
