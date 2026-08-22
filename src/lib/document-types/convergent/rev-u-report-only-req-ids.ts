/**
 * Requirements Verified rows from 790-00134R Rev U Report Only.
 * This is the client-published partial-execution matrix for 4.7.1.1011,
 * not the full Appendix B / 822-00007 protocol inventory.
 */
export const REV_U_REPORT_ONLY_REQ_IDS = [
  "SW-IN-1",
  "SW-IN-1.1",
  "SW-IN-2",
  "SW-WLP-24.1",
  "SW-WLP-5",
  "SW-SST-5.1.1",
  "SW-SST-6.4",
  "SW-PA-1",
  "SW-SIB-3",
  "SW-EH-1.2",
  "SW-SDT-1",
  "SW-SS-4",
  "SW-LCB-1",
  "SW-LWB-4",
] as const;

export type RevUReportOnlyReqId = (typeof REV_U_REPORT_ONLY_REQ_IDS)[number];
