/**
 * Transcript reconstructed from the Trend Water Langfuse incident
 * (P1-PuW QUALIFICATION PHASE II.pdf pages 1–2). Dual unlabeled RESULT
 * columns: left = conductivity (μS/cm, LEVEL 5.1), right = TOC (ppb).
 */

export const P1_PUW_FILENAME = "P1-PuW QUALIFICATION PHASE II.pdf";

export const P1_PUW_PAGE1_TRANSCRIPT = `DATE↓ RESULT LEVEL RESULT — Sampling Point
17.11.2022 2.179 5.1 213.4
18.11.2022 2.418 5.1 174.1
19.11.2022 2.880 5.1 186.2
20.11.2022 2.501 5.1 234.1
21.11.2022 1.111 5.1 161.8
22.11.2022 2.112 5.1 173.1
23.11.2022 1.413 5.1 152.3
24.11.2022 1.412 5.1 147.5
25.11.2022 1.669 5.1 184.8
26.11.2022 1.418 5.1 199.7
27.11.2022 1.516 5.1 194.2
28.11.2022 1.514 5.1 204.2
29.11.2022 1.831 5.1 189.0
30.11.2022 1.512 5.1 NA
01.12.2022 1.419 5.1 177.5
MIN. 1.111 147.5
MAX. 2.880 234.1
Frequency P1-PuW-03 CONDUCTIVITY TOC As per SOP No.-SOP/QC/091 Remark NADue to Fumigation on 07.05.2020 Sampling has not been done.`;

export const P1_PUW_PAGE2_TRANSCRIPT = `RESULT LEVEL — LEVEL -PuW-03 TOC 020 Sampling has not been done. μS/cm DATE Test- CONDUCTIVITY Sampling Point- P1- 0.0 50.0 100.0 150.0 200.0 250.0 300.0 350.0 400.0 450.0 500.0 ppb DATE Test -TOC Sampling Point -P1-PuW RESULT
LEVEL 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 -PuW-03 TOC 020 Sampling has not been done. 0 1 2 3 4 5 6 μS/cm DATE Test- CONDUCTIVITY Sampling Point- P1- RESULT LEVEL 0.0 50.0 100.0 150.0 200.0 250.0 300.0 350.0 400.0 450.0 500.0 ppb DATE Test -TOC Sampling Point -P1-PuW RESULT`;

export const P1_PUW_COMBINED_TRANSCRIPT = `${P1_PUW_PAGE1_TRANSCRIPT}\n\n${P1_PUW_PAGE2_TRANSCRIPT}`;

export const P1_PUW_CONDUCTIVITY_ROWS = [
  { date: "17.11.2022", value: "2.179" },
  { date: "18.11.2022", value: "2.418" },
  { date: "19.11.2022", value: "2.880" },
  { date: "20.11.2022", value: "2.501" },
  { date: "21.11.2022", value: "1.111" },
  { date: "22.11.2022", value: "2.112" },
  { date: "23.11.2022", value: "1.413" },
  { date: "24.11.2022", value: "1.412" },
  { date: "25.11.2022", value: "1.669" },
  { date: "26.11.2022", value: "1.418" },
  { date: "27.11.2022", value: "1.516" },
  { date: "28.11.2022", value: "1.514" },
  { date: "29.11.2022", value: "1.831" },
  { date: "30.11.2022", value: "1.512" },
  { date: "01.12.2022", value: "1.419" },
] as const;

export const P1_PUW_TOC_ROWS = [
  { date: "17.11.2022", value: "213.4" },
  { date: "18.11.2022", value: "174.1" },
  { date: "19.11.2022", value: "186.2" },
  { date: "20.11.2022", value: "234.1" },
  { date: "21.11.2022", value: "161.8" },
  { date: "22.11.2022", value: "173.1" },
  { date: "23.11.2022", value: "152.3" },
  { date: "24.11.2022", value: "147.5" },
  { date: "25.11.2022", value: "184.8" },
  { date: "26.11.2022", value: "199.7" },
  { date: "27.11.2022", value: "194.2" },
  { date: "28.11.2022", value: "204.2" },
  { date: "29.11.2022", value: "189.0" },
  { date: "30.11.2022", value: null },
  { date: "01.12.2022", value: "177.5" },
] as const;
