/**
 * Seed demo investigation reports for the Andrei whitelabel.
 *
 *   DATABASE_URL='postgresql://…demo…' pnpm seed-demo-reports
 *
 * Creates / refreshes demo users (password DemoPass123!, mustChangePassword):
 *   sachin@andreihealth.com / aditya@andreihealth.com — engineer
 *   sachin+manager@andreihealth.com / aditya+manager@andreihealth.com — manager
 *   sachin+admin@andreihealth.com / aditya+admin@andreihealth.com — admin
 *
 * Also removes legacy demo logins engineer@company.com / manager@company.com
 * (reassigns their reports/manager links to the primary sachin accounts).
 *
 * The five demo reports cover medical-device manufacturing deviations
 * (sterilization, aseptic assembly, injection molding, data integrity,
 * incoming supplier component) so the DMAIC editor, tool variations, and
 * Andrei's AI traffic-light evaluation are all exercised. Content is
 * fictional — no real people, sites, or lot numbers.
 *
 * Re-running is idempotent: existing demo reports (matched by the primary
 * engineer + deviation number) are updated in place, so this doubles as the
 * "refresh demo content" command.
 */
import { config } from "dotenv";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "../src/db";
import { reportManagers, reports, reportSections, workspaceUsers } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { initialPasswordHistory } from "../src/lib/auth/password-history";
import { getPasswordPolicy } from "../src/lib/auth/password-policy";
import { insertReportManagers } from "../src/lib/reports/managers";
import { legacyStringToDoc, emptyDoc } from "../src/lib/tiptap/rich-text";
import { REPORT_SECTION_ROW_ORDER } from "../src/types/sections";
import type { SectionContentMap } from "../src/types/sections";
import { EMPTY_CONTENT } from "../src/types/sections";

// Prefer an explicit shell DATABASE_URL (demo Neon) over .env.local.
const shellDatabaseUrl = process.env.DATABASE_URL;
config({ path: ".env" });
config({ path: ".env.local", override: true });
if (shellDatabaseUrl) {
  process.env.DATABASE_URL = shellDatabaseUrl;
}

const DEMO_PASSWORD = "DemoPass123!";

type DemoUserRole = "engineer" | "manager" | "admin";

type DemoUserSpec = {
  email: string;
  role: DemoUserRole;
};

/** Canonical whitelabel demo accounts. */
const DEMO_USERS: DemoUserSpec[] = [
  { email: "sachin@andreihealth.com", role: "engineer" },
  { email: "aditya@andreihealth.com", role: "engineer" },
  { email: "sachin+manager@andreihealth.com", role: "manager" },
  { email: "aditya+manager@andreihealth.com", role: "manager" },
  { email: "sachin+admin@andreihealth.com", role: "admin" },
  { email: "aditya+admin@andreihealth.com", role: "admin" },
];

/** Reports are authored / assigned under these primary accounts. */
const PRIMARY_ENGINEER_EMAIL = "sachin@andreihealth.com";
const PRIMARY_MANAGER_EMAIL = "sachin+manager@andreihealth.com";

/** Retired placeholder logins — removed after reassignment. */
const LEGACY_DEMO_EMAILS = ["engineer@company.com", "manager@company.com"] as const;

type DemoReportSpec = {
  deviationNo: string;
  title: string;
  status: "draft" | "submitted" | "in_review" | "approved";
  toolsUsed: { sixM: boolean; fiveWhy: boolean; brainstorming: boolean };
  otherTools?: string;
  sections: Partial<SectionContentMap>;
};

const DEMO_REPORTS: DemoReportSpec[] = [
  // 1 — Sterilization / QC release. Tools: 6M + 5-Why, supporting experiment.
  {
    deviationNo: "DEV-STE-26-011",
    title: "Ethylene oxide residual out of specification on sterilized lot",
    status: "in_review",
    toolsUsed: { sixM: true, fiveWhy: true, brainstorming: false },
    otherTools: "Not Applicable",
    sections: {
      define: {
        narrative: legacyStringToDoc(
          [
            "On 12/03/2026 at 09:40 hrs, during final release testing of sterilized lot LOT-26-0417 (single-use infusion set, product code IS-200), the QC analyst (Emp. ID: 1148) reviewing the ethylene oxide (EO) residual report observed an EO residual of 6.8 mg per device, which is outside the acceptance limit of NMT 4.0 mg per device defined for the tolerable contact limit in SOP/QC/031.",
            "The expected result per SOP/QC/031 (Rev. R05, \"Determination of Ethylene Oxide and Ethylene Chlorohydrin Residuals by Headspace GC\"), Section 7.9, is NMT 4.0 mg/device based on ISO 10993-7 limited-exposure category. The observed 6.8 mg/device exceeds this limit; ethylene chlorohydrin (ECH) was within limit at 1.2 mg/device (limit NMT 9.0 mg/device).",
            "The nonconformance was detected in the QC Instrument Lab (Room QC-2, GF-14) on gas chromatograph GC/QC/007. The sterilization was performed in EO sterilizer STE/04 located in the Sterilization Suite (GF-31).",
            "Initial scope: sterilized lot LOT-26-0417 (2,400 units) held in quarantine. Sterilizer STE/04 aeration cycle and the two co-processed lots in the same sterilization load (LOT-26-0418 and LOT-26-0419) were included in the initial scope pending assessment. No product had been released or distributed at the time of detection.",
          ].join("\n")
        ),
      },
      measure: {
        experimentNumber: "EXP-26-033",
        experimentTitle: "EO residual desorption verification after extended aeration",
        purpose: legacyStringToDoc(
          "Verify whether the elevated EO residual was driven by insufficient aeration time by subjecting retained devices from LOT-26-0417 to an additional 24-hour aeration cycle at 50 °C and re-testing EO residual, confirming the analytical method itself was not the source of the elevated result."
        ),
        conclusion: legacyStringToDoc(
          "After an additional 24-hour aeration cycle, EO residual on the same devices dropped from 6.8 mg/device to 2.1 mg/device (within NMT 4.0 mg/device), while ECH remained within limit. System suitability and a spiked recovery standard on GC/QC/007 were within acceptance (98.6% recovery), confirming the analytical method was accurate and the elevated result was caused by incomplete desorption during the original aeration cycle, not by a testing error."
        ),
        narrative: legacyStringToDoc(
          [
            "The following facts and data were reviewed: the EO sterilization cycle record for STE/04 load 26-L-088, the aeration cycle chart, the chamber temperature and humidity trends, the GC/QC/007 chromatograms and system suitability, the analyst's raw data, and the sterilization and aeration SOPs. All records were reviewed by the QC investigator (Sr. Executive, Emp. ID: 1148) with the Sterilization officer (Emp. ID: 972).",
            "The gas exposure phase of load 26-L-088 met all validated set points (600 mg/L EO concentration, 55 °C, 60% RH, 3-hour dwell). However, the aeration phase record showed the cycle was ended after 8 hours against a validated minimum of 12 hours of forced aeration at 50 °C. The aeration chart confirmed the chamber was returned to ambient and unloaded at the 8-hour mark.",
            "Review of the GC/QC/007 calibration, the standard preparation, and the spiked recovery confirmed the analytical result of 6.8 mg/device was valid — the device genuinely retained EO above the limit at the time of test.",
            "Conclusion of the review: the elevated EO residual is attributable to a shortened aeration phase (8 hours vs. the validated 12-hour minimum). The supporting desorption experiment (EXP-26-033) confirmed that extended aeration brings residuals within limits and that the analytical method was accurate.",
          ].join("\n")
        ),
        regulatoryNotification:
          "No regulatory notification required. The affected lot was contained in quarantine before release; no nonconforming product reached distribution, and no Medical Device Report (MDR) reportable event occurred.",
      },
      analyze: {
        ...EMPTY_CONTENT.analyze,
        sixM: {
          man: "The sterilizer operator (Emp. ID: 861) is qualified and current on STE/04 training. Interview confirmed the operator manually ended the aeration cycle early to release the chamber for a scheduled production sterilization load, believing residual aeration on the warehouse aeration racks would be sufficient. No gap in individual competence; the contributing factor is a procedural decision under schedule pressure.",
          machine: "EO sterilizer STE/04 is qualified and within its PQ; the gas exposure phase met all validated set points. The aeration phase is operator-selectable on the current recipe rather than interlocked to a validated minimum, which allowed the cycle to be ended early. Contributing (machine/control) factor confirmed.",
          measurement: "GC/QC/007 is calibrated (due 30/06/2026) and system suitability passed. Spiked recovery was 98.6%. The measurement system is sound; the OOS result is a true reflection of product residual, not a measurement error.",
          material: "Devices, packaging (Tyvek pouch), and EO gas cartridge lot were within specification and sourced from approved suppliers. No material-related contributing factor.",
          method: "The sterilization method (SOP/STE/018) defines a validated 12-hour minimum forced-aeration phase, but the STE/04 recipe did not enforce it as a locked parameter, and the batch record did not require an aeration-duration verification before unload. Method/control gap confirmed as a contributing factor.",
          milieu: "Sterilization Suite temperature, humidity, and differential pressure were within range for the cycle. Warehouse aeration area conditions were nominal. No environmental contributing factor.",
          conclusion:
            "Primary contributing factors are Man (operator ended aeration early under schedule pressure) and Method/Machine (aeration minimum not enforced as a locked recipe parameter and not verified in the batch record). Measurement, Material, and Milieu did not contribute.",
        },
        fiveWhy: {
          narrative: legacyStringToDoc(
            [
              "1. WHY: Why was the EO residual on LOT-26-0417 above the 4.0 mg/device limit?",
              "Ans. Because the sterilized devices retained EO gas above the tolerable contact limit at the time of release testing.",
              "2. WHY: Why did the devices retain EO above the limit?",
              "Ans. Because the forced-aeration phase for load 26-L-088 was ended after 8 hours instead of the validated 12-hour minimum, so insufficient EO desorbed from the devices.",
              "3. WHY: Why was the aeration phase ended early?",
              "Ans. Because the operator manually ended the cycle to free STE/04 for a scheduled production load and assumed passive aeration on the warehouse racks would complete desorption.",
              "4. WHY: Why was the operator able to end the aeration phase before the validated minimum?",
              "Ans. Because the STE/04 sterilization recipe treats aeration duration as an operator-adjustable value rather than a locked parameter, and the batch record does not require verification of aeration duration before unload.",
              "5. WHY: Why was aeration duration not locked or verified?",
              "Ans. Because when STE/04 was commissioned the recipe was configured for flexibility during validation and the parameter lock and batch-record verification step were never added to the released production recipe and procedure.",
            ].join("\n")
          ),
          conclusion: "",
        },
        brainstorming: "",
        otherTools: "",
        investigationOutcome: legacyStringToDoc(
          [
            "The investigation was driven through the DMAIC methodology using the 6M method and the 5-Why approach as the primary root-cause tools. Based on the initial risk assessment, the deviation was categorized as 'Major' because it affects a released-stage sterility/biocompatibility attribute of a patient-contacting device.",
            "Both tools converge on a single assignable root cause: the forced-aeration phase was ended before the validated 12-hour minimum because aeration duration was not enforced as a locked recipe parameter and was not verified in the batch record, compounded by an operator decision under schedule pressure. The supporting desorption experiment (EXP-26-033) confirmed the mechanism — extended aeration returned residuals to within limits — and confirmed the analytical method was accurate.",
          ].join("\n")
        ),
        rootCause: {
          narrative: legacyStringToDoc(
            [
              "Primary Root Cause (Level 1): Method / Procedure — the validated 12-hour minimum forced-aeration phase was not enforced or verified before chamber unload.",
              "Secondary Root Cause (Level 2): Machine / Control configuration — the STE/04 recipe allowed aeration duration to be operator-adjustable rather than a locked, validated parameter.",
              "Third Root Cause (Level 3): Human factors — the operator ended aeration early under schedule pressure, relying on unqualified passive aeration.",
            ].join("\n")
          ),
        },
        impactAssessment: legacyStringToDoc(
          [
            "System: The quality system detected the nonconformance at release testing before any product release, confirming the release control worked as intended. No systemic impact beyond the aeration-control gap addressed in CAPA.",
            "Document: SOP/STE/018 and the STE/04 batch record require revision to add a locked aeration minimum and an aeration-duration verification step; no other documents impacted.",
            "Product: LOT-26-0417 (2,400 units) is nonconforming as originally processed and held in quarantine. Co-processed lots LOT-26-0418 and LOT-26-0419 from the same load were tested and one required re-aeration; both are addressed under lot disposition.",
            "Equipment: STE/04 remains qualified; the gas exposure phase performed correctly. The finding is a recipe/control configuration gap, not equipment failure.",
            "Patient safety / Past batches: No nonconforming product reached distribution. A retrospective review of the prior 12 months of STE/04 aeration records was performed to detect any similar early-unload events (see corrective action).",
          ].join("\n")
        ),
      },
      improve: {
        narrative: emptyDoc(),
        correctiveActions: legacyStringToDoc(
          [
            "CA-26-041: Re-aerate LOT-26-0417 for an additional validated 24-hour aeration cycle on STE/04 and re-test EO and ECH residuals; release the lot only if both are within limits, otherwise reject. Responsible: Sterilization Officer (Emp. ID: 972). Due: 20/03/2026. Expected outcome (verifiable): EO residual NMT 4.0 mg/device and ECH NMT 9.0 mg/device on re-test, evidenced by a GC/QC/007 report.",
            "CA-26-042: Test and disposition co-processed lots LOT-26-0418 and LOT-26-0419 from load 26-L-088 for EO/ECH residual; re-aerate any lot that exceeds limits before disposition. Responsible: QC Executive (Emp. ID: 1148). Due: 22/03/2026. Expected outcome: documented residual results within limits for both lots prior to release.",
            "CA-26-043: Perform a retrospective review of the last 12 months of STE/04 aeration cycle records to identify any additional early-unload events; escalate any finding as a new deviation. Responsible: QA Officer (Emp. ID: 604). Due: 31/03/2026. Expected outcome: a documented review report confirming no further impacted lots, or a list of any lots requiring assessment.",
            "All corrective actions above are achievable with existing equipment, retained samples, and available records.",
          ].join("\n")
        ),
      },
      control: {
        preventiveActions: legacyStringToDoc(
          [
            "PA-26-058 (CAPA No. CAPA-26-019): Reconfigure the STE/04 sterilization recipe to lock the forced-aeration phase to the validated 12-hour minimum so it cannot be ended early by the operator, and revalidate the recipe (IQ/OQ change control). Linked to Level 1/Level 2 root cause (aeration minimum not enforced as a locked parameter). Responsible: Engineering Manager (Emp. ID: 511). Due: 30/04/2026. Expected outcome (verifiable): change-controlled recipe in which aeration duration is a locked parameter, evidenced by revalidation report and a demonstrated inability to unload before 12 hours.",
            "PA-26-059 (CAPA No. CAPA-26-019): Revise SOP/STE/018 and the STE/04 batch record to add a mandatory aeration-duration verification and second-person check before chamber unload. Linked to Level 1 root cause. Responsible: QA Officer (Emp. ID: 604). Due: 15/04/2026. Expected outcome: revised, approved SOP and batch record with the verification step, and trained operators.",
            "Effectiveness verification: Required, given the major quality impact. Verification will start after the revised recipe and SOP are implemented and will review 100% of STE/04 aeration records across the first 20 production loads (approximately three months). Acceptance criterion: zero loads unloaded before the locked 12-hour aeration minimum and 100% completion of the batch-record aeration verification. Responsible: QA Manager (Emp. ID: 288). Tracked under CAPA-26-019.",
            "Interim plan: Until the recipe lock is implemented, a mandatory QA second-person sign-off of aeration duration is required before any STE/04 chamber unload, communicated by quality alert QA-ALERT-26-006 on 13/03/2026. This bridges the control gap during the CAPA implementation period.",
            "Impact assessment (closure): Regulatory Impact — none; no reportable event and no distributed product. Regulatory notification — not required. Product Quality — contained to load 26-L-088; addressed by re-aeration and testing. Validation — STE/04 aeration control to be revalidated under change control. Stability — not impacted; EO residual does not affect labeled shelf life once within limits. Market / Clinical — no impact; no product in the field.",
            "Recommended lot disposition: LOT-26-0417, LOT-26-0418, and LOT-26-0419 to be released only after re-aeration (as needed) and confirmatory residual testing within limits; any lot failing re-test to be rejected. This disposition matches the investigation conclusion and impact assessment.",
            "Final comments: The nonconformance was caused by an unenforced aeration minimum and an operator decision under schedule pressure, detected by an effective release control. Corrective actions contain and disposition the affected load; preventive actions lock the aeration minimum and add a verification step to prevent recurrence. CAPA-26-019 must be verified complete before final disposition of the affected lots.",
          ].join("\n")
        ),
      },
      conclusion: {
        narrative: legacyStringToDoc(
          [
            "Root cause: the forced-aeration phase of EO sterilization load 26-L-088 was ended after 8 hours instead of the validated 12-hour minimum, because aeration duration was not locked in the STE/04 recipe or verified in the batch record, compounded by an operator decision under schedule pressure. This left EO residual on LOT-26-0417 above the 4.0 mg/device limit.",
            "Final scope and impact: contained to the three lots of sterilization load 26-L-088 (LOT-26-0417/0418/0419). No nonconforming product was released or distributed; there is no patient-safety or market impact.",
            "Disposition: the affected lots will be released only after additional validated aeration and confirmatory EO/ECH residual testing within limits; any lot failing re-test will be rejected. The desorption experiment (EXP-26-033) confirmed extended aeration restores residuals to within limits.",
            "Closure: no regulatory notification is required. CAPA-26-019 (recipe parameter lock, SOP/batch-record revision, and effectiveness verification) must be verified complete prior to final lot disposition. The investigation is complete pending CAPA closure.",
          ].join("\n")
        ),
      },
    },
  },

  // 2 — Aseptic assembly / environmental monitoring. Tools: 5-Why only.
  {
    deviationNo: "DEV-EM-26-004",
    title: "Grade A environmental monitoring excursion during aseptic assembly",
    status: "submitted",
    toolsUsed: { sixM: false, fiveWhy: true, brainstorming: false },
    otherTools: "Not Applicable",
    sections: {
      define: {
        narrative: legacyStringToDoc(
          [
            "On 05/02/2026, while reviewing the viable environmental monitoring (EM) results for the 03/02/2026 aseptic assembly session of pre-filled safety syringe lot LOT-26-0203 (product code SY-050), the Microbiology reviewer (Emp. ID: 1305) observed a viable count of 3 CFU on the active-air sample taken at the Grade A filling zone, against an action limit of NMT 1 CFU per cubic metre defined in SOP/MB/022 for Grade A / ISO 5.",
            "Per SOP/MB/022 (Rev. R03, \"Environmental Monitoring Program for Aseptic Areas\"), Section 7.6, the Grade A active-air action limit is NMT 1 CFU/m3. The observed 3 CFU/m3 at sample point EM-A-02 exceeds this limit. Surface and settle-plate samples for the same session were within limits.",
            "The excursion occurred at the Grade A filling zone within Cleanroom CR-3 (Aseptic Suite, FF-08). Detection occurred at plate read-out in the Microbiology Lab (GF-16) on 05/02/2026 after the standard incubation period.",
            "Initial scope: aseptic assembly session for lot LOT-26-0203 (1,150 units) held in quarantine, the Grade A zone of Cleanroom CR-3, and the two operators gowned for that session. No adjacent sessions or lots were in process at the same filling zone during the excursion window.",
          ].join("\n")
        ),
      },
      measure: {
        narrative: legacyStringToDoc(
          [
            "The following facts and data were reviewed by the Microbiology investigator (Sr. Executive, Emp. ID: 1305) with the Production officer (Emp. ID: 749): the EM raw data and trend for sample point EM-A-02, the CR-3 HVAC and differential-pressure records for 03/02/2026, the non-viable particle counts for the session, the operator gowning qualification records and gowning log, the line-clearance record, and the session batch record.",
            "The CR-3 HVAC, HEPA integrity (last tested 15/01/2026), and room/zone differential pressures were within limits throughout the session, and non-viable particle counts remained within Grade A limits. This ruled out a facility air-supply cause.",
            "Review of the gowning log identified that one of the two operators (Emp. ID: 883) had a gowning qualification that expired on 31/01/2026 — three days before the session — and therefore was not currently qualified for Grade A intervention at the time of assembly. The session involved several manual interventions at the filling zone.",
            "The organism recovered from the EM-A-02 plate was identified as a Gram-positive coccus consistent with normal human skin flora, supporting an operator-borne contamination route rather than a facility or utility source.",
            "Conclusion of the review: the excursion is most consistent with operator-borne contamination during Grade A interventions performed by an operator whose gowning qualification had lapsed. Facility, HVAC, and non-viable particle data were all within limits.",
          ].join("\n")
        ),
        regulatoryNotification:
          "No regulatory notification required. The excursion was an in-process EM action-limit exceedance with the affected lot contained in quarantine; there was no confirmed product sterility failure and no distributed product.",
      },
      analyze: {
        ...EMPTY_CONTENT.analyze,
        sixM: {
          man: "",
          machine: "",
          measurement: "",
          material: "",
          method: "",
          milieu: "",
          conclusion:
            "Not Applicable — the 5-Why approach was used as the primary root-cause tool for this deviation. The 6M method was not separately applied because the 5-Why chain, supported by organism identification and facility data review, resolved the assignable cause (lapsed operator gowning qualification) without ambiguity.",
        },
        fiveWhy: {
          narrative: legacyStringToDoc(
            [
              "1. WHY: Why did the Grade A active-air sample at EM-A-02 exceed the 1 CFU/m3 action limit?",
              "Ans. Because viable organisms (3 CFU/m3), identified as skin flora, were present in the Grade A filling zone during the aseptic assembly session.",
              "2. WHY: Why were skin-flora organisms present in the Grade A zone?",
              "Ans. Because contamination was shed during manual interventions at the filling zone, most consistent with an operator-borne route given normal HVAC, HEPA integrity, and non-viable particle data.",
              "3. WHY: Why did an operator-borne contamination route occur despite the gowning program?",
              "Ans. Because one of the two operators performing Grade A interventions had a gowning qualification that had expired on 31/01/2026 and was not currently qualified for aseptic intervention.",
              "4. WHY: Why was an operator with an expired gowning qualification allowed to perform Grade A interventions?",
              "Ans. Because the pre-session line-clearance check did not include verification of each operator's current gowning-qualification status, and the qualification-expiry tracking was maintained manually.",
              "5. WHY: Why did the line-clearance check not verify gowning-qualification status?",
              "Ans. Because SOP/MB/024 line-clearance requirements did not mandate a documented check of operator gowning-qualification currency, so an expired qualification was not detected before the session.",
            ].join("\n")
          ),
          conclusion: "",
        },
        brainstorming: "",
        otherTools: "",
        investigationOutcome: legacyStringToDoc(
          [
            "The investigation was driven through the DMAIC methodology using the 5-Why approach as the primary root-cause tool, supported by microbial identification and facility-data review. Based on the initial risk assessment, the deviation was categorized as 'Major' due to the potential sterility-assurance impact on a sterile injectable device.",
            "The assignable root cause is an operator-borne contamination route enabled by a lapsed gowning qualification that was not detected at line clearance because gowning-qualification verification was not a required line-clearance control. Facility, HVAC, HEPA, and non-viable particle data were within limits and did not contribute.",
          ].join("\n")
        ),
        rootCause: {
          narrative: legacyStringToDoc(
            [
              "Primary Root Cause (Level 1): Human factors / training-qualification lapse — an operator with an expired Grade A gowning qualification performed aseptic interventions.",
              "Secondary Root Cause (Level 2): Procedure / control gap — the line-clearance procedure did not require verification of operator gowning-qualification currency before an aseptic session.",
              "Third Root Cause (Level 3): System — gowning-qualification expiry was tracked manually with no automated block on assignment.",
            ].join("\n")
          ),
        },
        impactAssessment: legacyStringToDoc(
          [
            "System: The EM program detected the excursion as designed. The gap is in the line-clearance control that gates operator assignment, addressed in CAPA.",
            "Document: SOP/MB/024 (line clearance) requires revision to add a gowning-qualification currency check; the gowning-qualification tracking process also requires strengthening.",
            "Product: Lot LOT-26-0203 (1,150 units) held in quarantine pending sterility testing and disposition; no other lots were in process at the zone during the excursion window.",
            "Equipment: No equipment impact; HVAC, HEPA, and monitoring instruments were qualified and within limits.",
            "Patient safety / Past batches: No distributed product affected. A review of gowning-qualification status for all operators assigned to Grade A sessions in the preceding month was initiated to confirm no other lapsed-qualification sessions occurred.",
          ].join("\n")
        ),
      },
      improve: {
        narrative: emptyDoc(),
        correctiveActions: legacyStringToDoc(
          [
            "CA-26-018: Complete sterility testing of lot LOT-26-0203 per SOP/MB/019 and disposition based on the result together with the EM excursion assessment. Responsible: Microbiology Executive (Emp. ID: 1305). Due: 24/02/2026. Expected outcome (verifiable): documented sterility result and a formal lot-disposition decision.",
            "CA-26-019: Re-qualify operator (Emp. ID: 883) for Grade A gowning per SOP/MB/023 before any further aseptic assignment. Responsible: Production Manager (Emp. ID: 749). Due: 18/02/2026. Expected outcome: passing gowning-qualification record on file prior to reassignment.",
            "CA-26-020: Review the gowning-qualification status of all operators assigned to Grade A aseptic sessions in the preceding 30 days to confirm no other lapsed-qualification sessions occurred; escalate any finding as a new deviation. Responsible: QA Officer (Emp. ID: 604). Due: 28/02/2026. Expected outcome: a documented review confirming currency for all sessions, or a list of any additional sessions requiring assessment.",
            "The corrective actions are achievable with existing microbiology capacity and personnel records.",
          ].join("\n")
        ),
      },
      control: {
        preventiveActions: legacyStringToDoc(
          [
            "PA-26-025 (CAPA No. CAPA-26-008): Revise SOP/MB/024 to add a mandatory, documented verification of each operator's current Grade A gowning-qualification status as part of pre-session line clearance. Linked to the Level 2 root cause (line-clearance control gap). Responsible: QA Officer (Emp. ID: 604). Due: 20/03/2026. Expected outcome (verifiable): revised, approved line-clearance procedure and record including the gowning-currency check.",
            "PA-26-026 (CAPA No. CAPA-26-008): Implement an automated block in the training/qualification system that prevents an operator with a lapsed gowning qualification from being scheduled to an aseptic session, and add a 30-day expiry alert. Linked to the Level 1/Level 3 root cause. Responsible: Training/QA Systems Lead (Emp. ID: 415). Due: 30/04/2026. Expected outcome: system configuration that blocks assignment and generates advance expiry alerts, evidenced by a configuration/test record.",
            "Effectiveness verification: Required. Verification will start after both preventive actions are implemented and will review 100% of Grade A session line-clearance records and scheduling for the first 25 aseptic sessions (approximately two months). Acceptance criterion: zero aseptic sessions performed by an operator with a lapsed gowning qualification and 100% documented gowning-currency checks at line clearance. Responsible: QA Manager (Emp. ID: 288). Tracked under CAPA-26-008.",
            "Interim plan: Until the automated block is live, QA will manually verify and sign the gowning-qualification currency of every operator before each Grade A session, communicated by quality alert QA-ALERT-26-003 on 06/02/2026. This maintains a state of control during CAPA implementation.",
            "Impact assessment (closure): Regulatory Impact — none. Regulatory notification — not required. Product Quality — potential sterility-assurance impact contained to LOT-26-0203 pending sterility results. Validation — no revalidation required; aseptic process validation remains valid. Stability — not impacted. Market / Clinical — no impact; no distributed product.",
            "Recommended lot disposition: LOT-26-0203 to be released only if sterility testing passes and the overall EM excursion assessment supports release; reject the lot if sterility fails or the assessment does not support release. This disposition matches the investigation conclusion and impact assessment.",
            "Final comments: The excursion resulted from operator-borne contamination enabled by a lapsed gowning qualification not caught at line clearance. Corrective actions disposition the lot and re-qualify the operator; preventive actions add a line-clearance gowning check and an automated scheduling block to prevent recurrence. CAPA-26-008 must be verified complete before final lot disposition.",
          ].join("\n")
        ),
      },
      conclusion: {
        narrative: legacyStringToDoc(
          [
            "Root cause: an operator with a Grade A gowning qualification that expired on 31/01/2026 performed aseptic interventions during the 03/02/2026 assembly session, causing operator-borne contamination that produced a 3 CFU/m3 Grade A active-air excursion. The lapse was not detected because line clearance did not require a gowning-qualification currency check.",
            "Final scope and impact: contained to lot LOT-26-0203 (held in quarantine) and the CR-3 Grade A zone for that session. Facility, HVAC, and non-viable data were within limits; no distributed product is affected.",
            "Disposition: LOT-26-0203 will be released only if sterility testing passes and the EM excursion assessment supports release; otherwise the lot will be rejected.",
            "Closure: no regulatory notification is required. CAPA-26-008 (line-clearance gowning check and automated scheduling block, with effectiveness verification) must be verified complete before final lot disposition. Investigation complete pending sterility results and CAPA closure.",
          ].join("\n")
        ),
      },
    },
  },

  // 3 — Injection molding / production in-process. Tools: 6M + brainstorming.
  {
    deviationNo: "DEV-MLD-26-021",
    title: "Injection-molded luer connector critical dimension out of specification",
    status: "draft",
    toolsUsed: { sixM: true, fiveWhy: false, brainstorming: true },
    otherTools: "Not Applicable",
    sections: {
      define: {
        narrative: legacyStringToDoc(
          [
            "On 09/03/2026 at 11:15 hrs, during in-process dimensional inspection of molded luer connectors (component code LC-014) from injection molding machine MLD/06, cavity 3, the molding technician (Emp. ID: 1052) observed that the luer taper outer diameter measured 3.94 mm, outside the drawing specification of 4.00 mm ± 0.03 mm (3.97–4.03 mm) defined in drawing DRW-LC-014 Rev. C.",
            "Per the in-process inspection plan (SOP/MFG/027, Rev. R02), the luer taper outer diameter is a critical-to-quality (CTQ) dimension with a specification of 3.97–4.03 mm. The observed 3.94 mm from cavity 3 is below the lower limit; the same dimension from cavities 1, 2, and 4 measured within specification (3.99–4.01 mm).",
            "The nonconformance occurred at Molding Line 2 (GF-22) on machine MLD/06 (4-cavity tool T-LC-014). Detection occurred at the in-process inspection station adjacent to the line during the scheduled hourly CTQ check.",
            "Initial scope: molded components from MLD/06 cavity 3 produced since the previous in-process check (approximately one hour of output, container CTN-26-3391, 1,800 components) held on the line; cavities 1, 2, and 4 output within specification; molding tool T-LC-014 and machine MLD/06 included pending assessment. No components had been transferred to assembly.",
          ].join("\n")
        ),
      },
      measure: {
        narrative: legacyStringToDoc(
          [
            "The following facts and data were reviewed by the Production investigator (Sr. Executive, Emp. ID: 1052) with the Tooling engineer (Emp. ID: 690): the MLD/06 process parameter log for the run, the setup sheet against the validated process window, the CTQ inspection trend for the shift, the tool maintenance and cleaning history for T-LC-014, and the resin lot record.",
            "The molding process parameters (barrel temperatures, injection pressure, hold pressure, and cycle time) were within the validated process window for the run overall. However, the cavity-3 cooling-water return temperature logged approximately 6 °C higher than cavities 1, 2, and 4, indicating reduced cooling in that cavity.",
            "Review of the CTQ trend showed cavity-3 taper diameter drifting downward over the preceding three hourly checks (4.01 → 3.99 → 3.94 mm) while the other cavities remained stable, consistent with a progressive cavity-3 cooling issue rather than a step change.",
            "The resin lot (medical-grade polycarbonate, LOT-RES-26-118) was within specification and within its dry-time window; moisture analysis of a retained sample was within limits, ruling out a material contribution.",
            "Conclusion of the review: the cavity-3 undersize is attributable to reduced cooling in cavity 3 (elevated return temperature), causing greater part shrinkage and a progressive downward drift of the taper diameter. Material and overall machine set points were not contributors.",
          ].join("\n")
        ),
        regulatoryNotification:
          "Not Applicable. This is an in-process component nonconformance contained on the molding line; no finished device, released lot, or distributed product is involved, so no regulatory notification is required.",
      },
      analyze: {
        ...EMPTY_CONTENT.analyze,
        sixM: {
          man: "The molding technician (Emp. ID: 1052) is qualified on MLD/06 and performed the CTQ checks correctly, detecting the drift at the hourly inspection. No man-related contributing factor; the operator's monitoring worked as intended.",
          machine: "Machine MLD/06 held validated barrel temperatures, injection/hold pressures, and cycle time. However, the cavity-3 cooling circuit return temperature was ~6 °C above the other cavities, indicating restricted coolant flow to cavity 3. Machine/tooling cooling is the confirmed contributing factor.",
          measurement: "The CTQ gauge (bench micrometer G/MFG/044) is calibrated (due 31/05/2026) and gauge R&R is acceptable. Re-measurement with a second calibrated gauge confirmed 3.94 mm. No measurement-related contributing factor.",
          material: "Resin lot LOT-RES-26-118 (medical-grade polycarbonate) is within specification, from an approved supplier, and within dry-time limits; retained-sample moisture was within limits. No material contributing factor.",
          method: "The molding process and inspection method were followed as validated. The preventive maintenance interval for the tool cooling circuits does not include periodic verification of per-cavity coolant flow/temperature balance, which allowed a gradual cavity-3 restriction to go undetected. Method/PM gap is a contributing factor.",
          milieu: "Molding area temperature and humidity were within range. No environmental contributing factor.",
          conclusion:
            "The confirmed contributing factors are Machine (restricted cavity-3 cooling causing elevated return temperature and increased shrinkage) and Method (PM did not include per-cavity coolant balance verification). Man, Measurement, Material, and Milieu did not contribute.",
        },
        fiveWhy: {
          narrative: emptyDoc(),
          conclusion: "",
        },
        brainstorming:
          "The cross-functional team (Production, Tooling, Quality) brainstormed possible causes of the cavity-3 undersize: (a) resin moisture / drying variation; (b) resin lot shrinkage variation; (c) reduced/blocked cooling in the cavity-3 circuit; (d) worn or damaged cavity-3 tool surface; (e) localized barrel-temperature variation; (f) gauge or measurement error; (g) hold-pressure or cycle-time drift. Data review eliminated (a), (b), (e), (f), and (g) — resin and machine set points were in-spec and measurement was confirmed. Tool inspection found no wear on the cavity-3 surface, reducing the likelihood of (d). The elevated cavity-3 cooling-return temperature and the progressive one-cavity drift pointed strongly to (c), restricted cavity-3 cooling, as the most probable cause.",
        otherTools: "",
        investigationOutcome: legacyStringToDoc(
          [
            "The investigation was driven through the DMAIC methodology using the 6M method and a structured Brainstorming session as the root-cause tools. Based on the initial risk assessment, the deviation was categorized as 'Minor' because it is an in-process component nonconformance contained on the line with no finished-device impact.",
            "Both tools converge on restricted cooling in the cavity-3 circuit (elevated return temperature) as the assignable cause of the undersize taper, with a contributing gap in preventive maintenance that did not verify per-cavity coolant balance. Subsequent inspection found partial scale/debris obstruction in the cavity-3 cooling channel, confirming the mechanism.",
          ].join("\n")
        ),
        rootCause: {
          narrative: legacyStringToDoc(
            [
              "Primary Root Cause (Level 1): Machine / Tooling — partial obstruction (scale/debris) in the cavity-3 cooling channel reduced cooling, increasing part shrinkage and producing an undersize taper diameter.",
              "Secondary Root Cause (Level 2): Method / Preventive maintenance — the tool PM program did not include periodic verification of per-cavity coolant flow/temperature balance, allowing the restriction to develop undetected.",
              "Third Root Cause (Level 3): NA.",
            ].join("\n")
          ),
        },
        impactAssessment: legacyStringToDoc(
          [
            "System: The in-process CTQ control detected the drift as designed. The gap is in the tool PM program, addressed in CAPA.",
            "Document: SOP/MFG/025 (tool preventive maintenance) requires revision to add per-cavity coolant-balance verification; no other documents impacted.",
            "Product: Cavity-3 output since the previous check (container CTN-26-3391, 1,800 components) is nonconforming and segregated; cavity 1/2/4 output is within specification. No finished device is affected.",
            "Equipment: Molding tool T-LC-014 cavity-3 cooling channel required cleaning; machine MLD/06 is otherwise within qualification.",
            "Patient safety / Past batches: No finished device or distributed product affected. A review of the CTQ trend back to the last tool cleaning was performed to bound the affected output to cavity-3 material produced after the drift began.",
          ].join("\n")
        ),
      },
      improve: {
        narrative: emptyDoc(),
        correctiveActions: legacyStringToDoc(
          [
            "CA-26-052: Segregate and reject the nonconforming cavity-3 components in container CTN-26-3391 per the nonconforming-material procedure. Responsible: Production Executive (Emp. ID: 1052). Due: 11/03/2026. Expected outcome (verifiable): a documented nonconforming-material record and quarantine/rejection of the affected container.",
            "CA-26-053: Clean and clear the cavity-3 cooling channel of T-LC-014, verify balanced per-cavity coolant return temperature, and mold a verification run; release the tool back to production only after cavity-3 taper diameter is within 3.97–4.03 mm across a 30-piece sample from all cavities. Responsible: Tooling Engineer (Emp. ID: 690). Due: 13/03/2026. Expected outcome: verification-run dimensional report within specification for all cavities.",
            "CA-26-054: Review the cavity-3 CTQ trend back to the last tool cleaning to confirm the earliest affected output and ensure all such material is captured in CA-26-052. Responsible: QA Officer (Emp. ID: 604). Due: 14/03/2026. Expected outcome: a documented boundary of affected output with no in-spec-cavity material rejected unnecessarily.",
            "The corrective actions are achievable with existing tooling and inspection resources.",
          ].join("\n")
        ),
      },
      control: {
        preventiveActions: legacyStringToDoc(
          [
            "PA-26-071 (CAPA No. CAPA-26-024): Revise the tool preventive-maintenance program (SOP/MFG/025) to add periodic cleaning and per-cavity coolant flow/temperature-balance verification for multi-cavity molding tools, at a defined frequency. Linked to the Level 2 root cause (PM gap). Responsible: Engineering Manager (Emp. ID: 511). Due: 22/04/2026. Expected outcome (verifiable): revised, approved PM procedure with the coolant-balance verification and defined frequency, and updated tool PM records.",
            "PA-26-072 (CAPA No. CAPA-26-024): Add per-cavity cooling-return-temperature monitoring with an alert threshold on MLD/06 so an emerging cavity cooling imbalance is flagged before the CTQ dimension drifts out of specification. Linked to the Level 1 root cause. Responsible: Automation Engineer (Emp. ID: 733). Due: 15/05/2026. Expected outcome: configured monitoring and alerting, evidenced by a commissioning/test record.",
            "Effectiveness verification: Required (in-process, but a repeat could reach finished devices). Verification will start after both preventive actions are implemented and will review CTQ dimensional trends and coolant-balance/PM records for MLD/06 across the first 8 weeks of production. Acceptance criterion: zero cavity-attributable CTQ out-of-specification events and 100% completion of the new coolant-balance PM checks. Responsible: QA Manager (Emp. ID: 288). Tracked under CAPA-26-024.",
            "Interim plan: Until per-cavity cooling monitoring is live, the hourly CTQ check for LC-014 on MLD/06 will additionally record each cavity's cooling-return temperature and flag any cavity more than 4 °C above the others, communicated by production instruction PI-26-014 on 10/03/2026. This maintains control during CAPA implementation.",
            "Impact assessment (closure): Regulatory Impact — none. Regulatory notification — not required. Product Quality — contained to segregated cavity-3 in-process components; no finished device affected. Validation — molding process validation remains valid; the PM program is updated under change control. Stability — not applicable to an in-process component undersize. Market / Clinical — no impact; no distributed product.",
            "Recommended lot disposition: Nonconforming cavity-3 components in CTN-26-3391 to be rejected; cavity 1/2/4 output for the run to be accepted after confirmation it meets specification. This disposition matches the investigation conclusion and impact assessment.",
            "Final comments: The undersize taper was caused by restricted cavity-3 cooling with a contributing PM gap, detected by the in-process CTQ control. Corrective actions reject the affected components and restore the tool; preventive actions add coolant-balance PM and per-cavity cooling monitoring to prevent recurrence. CAPA-26-024 tracks implementation and effectiveness verification.",
          ].join("\n")
        ),
      },
      conclusion: {
        narrative: legacyStringToDoc(
          [
            "Root cause: a partial obstruction in the cavity-3 cooling channel of tool T-LC-014 reduced cooling and increased part shrinkage, causing the luer taper outer diameter from cavity 3 to drift below the 3.97 mm lower limit to 3.94 mm. A preventive-maintenance gap (no per-cavity coolant-balance verification) allowed the restriction to develop undetected.",
            "Final scope and impact: contained to cavity-3 in-process output since the previous check (container CTN-26-3391, 1,800 components); cavities 1, 2, and 4 were within specification. No finished device or distributed product is affected.",
            "Disposition: the nonconforming cavity-3 components will be rejected; the accepted-cavity output is released after confirmation of conformance. The tool is returned to production only after cooling-channel cleaning and a passing verification run.",
            "Closure: no regulatory notification is required. CAPA-26-024 (coolant-balance PM and per-cavity cooling monitoring, with effectiveness verification) tracks the preventive actions. The investigation is complete pending CAPA implementation.",
          ].join("\n")
        ),
      },
    },
  },

  // 4 — Data integrity / electronic records. Tools: 5-Why. Approved (closed) demo.
  {
    deviationNo: "DEV-DI-26-007",
    title: "Audit trail gap on automated vision inspection system",
    status: "approved",
    toolsUsed: { sixM: false, fiveWhy: true, brainstorming: false },
    otherTools: "Not Applicable",
    sections: {
      define: {
        narrative: legacyStringToDoc(
          [
            "On 21/01/2026, during an internal data-integrity audit, the QA auditor (Emp. ID: 318) reviewing the automated vision inspection system AVI/02 identified that audit-trail entries were missing for inspection-recipe parameter changes made during a vendor maintenance window on 16/01/2026, contrary to the audit-trail requirements of SOP/IT/009.",
            "Per SOP/IT/009 (Rev. R04, \"Computerized System Access, Audit Trail and Change Control\"), Section 7.11, all changes to inspection-recipe parameters on GxP computerized systems must be captured in a contemporaneous, attributable audit trail. Review of the AVI/02 audit trail for 16/01/2026 showed no entries for the recipe-parameter changes documented on the vendor's field-service report for that window.",
            "The gap was identified on the AVI/02 station in the Final Inspection area (FF-11). The affected period is the vendor maintenance window on 16/01/2026 (approximately 13:00–16:30 hrs).",
            "Initial scope: the AVI/02 audit trail for the 16/01/2026 maintenance window and any inspection recipes changed during that window. AVI/02 had been released back to production after the maintenance; lots inspected on AVI/02 between the maintenance window and the audit finding were included in the initial scope pending assessment.",
          ].join("\n")
        ),
      },
      measure: {
        narrative: legacyStringToDoc(
          [
            "The following facts and data were reviewed by the QA investigator (Sr. Executive, Emp. ID: 318) with the system administrator (Emp. ID: 452): the AVI/02 audit-trail export, the vendor field-service report and maintenance change ticket, the AVI/02 system configuration, the post-maintenance requalification record, and the inspection records for lots run after the maintenance.",
            "The vendor field-service report documented the recipe-parameter changes and the technician who performed them, so the changes themselves were traceable through the paper maintenance record even though the electronic audit trail did not capture them.",
            "Review of the AVI/02 configuration found that the audit-trail function had been temporarily disabled to apply the vendor software patch and was not re-enabled at the end of the maintenance window; the audit trail resumed only when the finding was investigated on 21/01/2026.",
            "Comparison of the current AVI/02 recipe parameters against the approved recipe master confirmed the post-maintenance parameters matched the approved values, and the post-maintenance requalification (challenge samples) had passed, indicating no unapproved or erroneous parameter values were in effect during production.",
            "Conclusion of the review: the audit-trail gap was a procedural/configuration lapse during vendor maintenance (audit trail disabled and not re-enabled). The parameter changes were reconcilable via the paper record, current parameters match the approved master, and requalification passed, so there was no evidence of unapproved or erroneous data during production.",
          ].join("\n")
        ),
        regulatoryNotification:
          "No regulatory notification required. The audit-trail gap was confined to a vendor maintenance window, the parameter changes were reconcilable through the maintenance record, and no erroneous or unapproved data affected released product.",
      },
      analyze: {
        ...EMPTY_CONTENT.analyze,
        sixM: {
          man: "",
          machine: "",
          measurement: "",
          material: "",
          method: "",
          milieu: "",
          conclusion:
            "Not Applicable — the 5-Why approach was used as the primary root-cause tool for this data-integrity deviation. The 6M method was not separately applied because the 5-Why chain fully resolved the assignable cause (audit trail disabled for a vendor patch and not re-enabled due to an outdated maintenance runbook).",
        },
        fiveWhy: {
          narrative: legacyStringToDoc(
            [
              "1. WHY: Why were audit-trail entries missing for the AVI/02 recipe changes on 16/01/2026?",
              "Ans. Because the AVI/02 audit-trail function was disabled during the vendor maintenance window and the changes were therefore not captured electronically.",
              "2. WHY: Why was the audit-trail function disabled?",
              "Ans. Because the vendor patch procedure required the audit trail to be temporarily disabled to apply the software update.",
              "3. WHY: Why was the audit trail not re-enabled at the end of the maintenance window?",
              "Ans. Because the maintenance runbook did not include an explicit step to re-enable and verify the audit trail before returning the system to production.",
              "4. WHY: Why did the maintenance runbook omit the re-enable/verify step?",
              "Ans. Because the runbook had not been updated for the current patch procedure/version, which introduced the temporary-disable step.",
              "5. WHY: Why was the runbook not updated for the current patch version?",
              "Ans. Because vendor-maintenance runbooks were not under a periodic review tied to vendor patch releases, so the runbook lagged behind the vendor's procedure change.",
            ].join("\n")
          ),
          conclusion: "",
        },
        brainstorming: "",
        otherTools: "",
        investigationOutcome: legacyStringToDoc(
          [
            "The investigation was driven through the DMAIC methodology using the 5-Why approach as the primary root-cause tool. Based on the initial risk assessment, the deviation was categorized as 'Major' due to the data-integrity nature of the finding on a GxP computerized system, notwithstanding the reconcilable outcome.",
            "The assignable root cause is an outdated vendor-maintenance runbook that lacked a step to re-enable and verify the audit trail after a patch, which itself resulted from runbooks not being reviewed against vendor patch releases. The parameter changes were reconcilable via the paper maintenance record and current parameters match the approved master, so there was no data-integrity impact on released product.",
          ].join("\n")
        ),
        rootCause: {
          narrative: legacyStringToDoc(
            [
              "Primary Root Cause (Level 1): Procedure / documentation — the vendor-maintenance runbook lacked an explicit step to re-enable and verify the audit trail before returning AVI/02 to production.",
              "Secondary Root Cause (Level 2): System governance — vendor-maintenance runbooks were not reviewed against vendor patch releases, so the runbook lagged the current patch procedure.",
              "Third Root Cause (Level 3): NA.",
            ].join("\n")
          ),
        },
        impactAssessment: legacyStringToDoc(
          [
            "System: The audit-trail control on AVI/02 was inactive during the maintenance window but was restored; the gap is in the maintenance runbook governing the change, addressed in CAPA.",
            "Document: SOP/IT/009 and the AVI/02 vendor-maintenance runbook require revision to add and govern the audit-trail re-enable/verify step; no other documents impacted.",
            "Product: Lots inspected on AVI/02 after the maintenance window were assessed; current parameters match the approved master and post-maintenance requalification passed, so no product was inspected under unapproved parameters.",
            "Equipment: AVI/02 remains qualified; the finding is a configuration/procedure lapse, not equipment failure.",
            "Patient safety / Past batches: No erroneous or unapproved data affected released product; no patient-safety impact. A reconciliation of the maintenance-window changes against the approved recipe master was completed.",
          ].join("\n")
        ),
      },
      improve: {
        narrative: emptyDoc(),
        correctiveActions: legacyStringToDoc(
          [
            "CA-26-006: Reconcile all AVI/02 recipe-parameter changes made during the 16/01/2026 maintenance window against the approved recipe master and the vendor field-service report, and document the reconciliation. Responsible: System Administrator (Emp. ID: 452). Due: 27/01/2026. Status: Completed 26/01/2026 — reconciliation confirmed current parameters match the approved master. Expected outcome (verifiable): a signed reconciliation record.",
            "CA-26-007: Re-enable and verify the AVI/02 audit-trail function and confirm contemporaneous capture with a test change. Responsible: System Administrator (Emp. ID: 452). Due: 22/01/2026. Status: Completed 21/01/2026 — audit trail re-enabled and verified. Expected outcome: a verification record showing the audit trail captures changes.",
            "CA-26-008: Assess and disposition the lots inspected on AVI/02 between the maintenance window and the finding based on the reconciliation and requalification results. Responsible: QA Officer (Emp. ID: 604). Due: 31/01/2026. Status: Completed — lots supported for release; no lot inspected under unapproved parameters. Expected outcome: a documented lot-assessment and disposition decision.",
            "The corrective actions were achievable and have been completed as recorded above.",
          ].join("\n")
        ),
      },
      control: {
        preventiveActions: legacyStringToDoc(
          [
            "PA-26-009 (CAPA No. CAPA-26-003): Revise the AVI/02 vendor-maintenance runbook and SOP/IT/009 to require an explicit, verified step to re-enable and confirm the audit trail (with a second-person check) before returning any GxP computerized system to production after maintenance. Linked to the Level 1 root cause. Responsible: QA/IT Lead (Emp. ID: 415). Due: 28/02/2026. Status: Completed 25/02/2026. Expected outcome (verifiable): revised, approved runbook and SOP including the re-enable/verify step, and trained system administrators.",
            "PA-26-010 (CAPA No. CAPA-26-003): Establish a periodic review of vendor-maintenance runbooks against vendor patch releases so runbooks stay current with vendor procedure changes. Linked to the Level 2 root cause. Responsible: QA/IT Lead (Emp. ID: 415). Due: 31/03/2026. Status: Completed 20/03/2026. Expected outcome: a defined review cadence and an initial reviewed set of runbooks on record.",
            "Effectiveness verification: Required. Verification reviewed the next three GxP computerized-system maintenance events after implementation. Acceptance criterion: 100% of maintenance events included a documented audit-trail re-enable/verify step with no post-maintenance audit-trail gap. Result: all three events met the criterion. Responsible: QA Manager (Emp. ID: 288). Tracked under CAPA-26-003 and verified effective on 30/06/2026.",
            "Interim plan: During CAPA implementation, a mandatory QA sign-off confirming audit-trail status was required before returning any GxP computerized system to production after maintenance, communicated by quality alert QA-ALERT-26-002 on 22/01/2026. The interim control has been superseded by the revised runbook.",
            "Impact assessment (closure): Regulatory Impact — none. Regulatory notification — not required. Product Quality — no impact; parameters reconciled to the approved master and requalification passed. Validation — AVI/02 remains validated; audit-trail configuration governed under change control. Stability — not applicable. Market / Clinical — no impact; no distributed product affected.",
            "Recommended lot disposition: Lots inspected on AVI/02 after the maintenance window are supported for release based on the parameter reconciliation and passing requalification. This disposition matches the investigation conclusion and impact assessment.",
            "Final comments: The audit-trail gap was caused by an outdated maintenance runbook that omitted an audit-trail re-enable/verify step, with no data-integrity impact on released product. Corrective actions reconciled the changes and restored the audit trail; preventive actions added the re-enable/verify step and a runbook review cadence. CAPA-26-003 was verified complete and effective before this investigation was closed and approved.",
          ].join("\n")
        ),
      },
      conclusion: {
        narrative: legacyStringToDoc(
          [
            "Root cause: the AVI/02 audit trail was temporarily disabled to apply a vendor software patch on 16/01/2026 and was not re-enabled because the vendor-maintenance runbook lacked an explicit re-enable/verify step; the runbook lagged the current patch procedure because runbooks were not reviewed against vendor patch releases.",
            "Final scope and impact: confined to the AVI/02 audit trail during the 16/01/2026 maintenance window. The parameter changes were reconcilable via the paper maintenance record, current parameters match the approved master, and post-maintenance requalification passed, so there was no data-integrity impact on released product.",
            "Disposition: lots inspected on AVI/02 after the maintenance window are supported for release based on the reconciliation and requalification.",
            "Closure: no regulatory notification was required. CAPA-26-003 (runbook and SOP revision plus a runbook review cadence) was verified complete and effective on 30/06/2026. The investigation is closed and approved.",
          ].join("\n")
        ),
      },
    },
  },

  // 5 — Incoming supplier component nonconformance. Tools: 6M + brainstorming, experiment.
  {
    deviationNo: "DEV-SUP-26-014",
    title: "Incoming silicone tubing lot fails extractables acceptance",
    status: "draft",
    toolsUsed: { sixM: true, fiveWhy: false, brainstorming: true },
    otherTools: "Not Applicable",
    sections: {
      define: {
        narrative: legacyStringToDoc(
          [
            "On 27/02/2026 at 14:05 hrs, during incoming inspection and testing of platinum-cured silicone tubing (material code RM-SIL-08) received under GRN-26-0662, the incoming-QC analyst (Emp. ID: 1201) observed that the non-volatile residue (NVR) extractables result was 3.6 mg per 100 cm2, outside the acceptance limit of NMT 2.0 mg per 100 cm2 defined in the incoming specification SPEC-RM-SIL-08.",
            "Per incoming specification SPEC-RM-SIL-08 (Rev. R02) and test method SOP/QC/044, the NVR extractables limit for silicone tubing used in the fluid path is NMT 2.0 mg/100 cm2. The observed 3.6 mg/100 cm2 exceeds this limit; tubing dimensions and appearance were within specification.",
            "The nonconformance was identified in the Incoming QC Lab (GF-15) on the extractables workstation. The affected material is supplier tubing lot SL-9042 (from approved supplier code SUP-118), received under GRN-26-0662.",
            "Initial scope: incoming silicone tubing lot SL-9042 (300 m across 6 reels) held in quarantine in the incoming-goods hold area; no material had been released to production. The initial scope was limited to lot SL-9042 pending assessment of any other lots from the same supplier shipment.",
          ].join("\n")
        ),
      },
      measure: {
        experimentNumber: "EXP-26-021",
        experimentTitle: "Extractables re-test with method verification and supplier CoA comparison",
        purpose: legacyStringToDoc(
          "Confirm the elevated NVR extractables result by re-testing lot SL-9042 in duplicate with a verified method (including a solvent blank and a reference-tubing control) and compare against the supplier's certificate of analysis (CoA) to determine whether the exceedance is a true material attribute or a testing artifact."
        ),
        conclusion: legacyStringToDoc(
          "Duplicate re-tests of lot SL-9042 returned NVR of 3.5 and 3.7 mg/100 cm2 (mean 3.6), the solvent blank was within acceptance, and the reference-tubing control returned 1.1 mg/100 cm2 (within limit), confirming the method was accurate and the exceedance is a true material attribute of lot SL-9042. The supplier CoA for SL-9042 reported NVR of 1.4 mg/100 cm2, indicating a discrepancy between the supplier's released result and the incoming result."
        ),
        narrative: legacyStringToDoc(
          [
            "The following facts and data were reviewed by the Incoming-QC investigator (Sr. Executive, Emp. ID: 1201) with the QA supplier-quality officer (Emp. ID: 577): the incoming test raw data and chromatograms, the supplier CoA for lot SL-9042, the receipt and storage records, the supplier's process-change notifications, and the extractables history for prior lots of RM-SIL-08 from the same supplier.",
            "Extractables history showed the previous six lots of RM-SIL-08 from supplier SUP-118 were within limits (0.9–1.5 mg/100 cm2), so lot SL-9042 at 3.6 mg/100 cm2 is a clear step change rather than a gradual trend.",
            "The supporting experiment (EXP-26-021) confirmed via duplicate re-tests, a solvent blank, and a reference-tubing control that the incoming result is accurate and represents a true material attribute, while the supplier CoA reported a much lower NVR (1.4 mg/100 cm2) for the same lot.",
            "Supplier records review identified a supplier notification (received 10/02/2026) indicating SUP-118 had changed the post-cure (secondary bake) step for silicone tubing; incomplete post-cure is a known cause of elevated silicone extractables, providing a plausible mechanism for the step change.",
            "Conclusion of the review: lot SL-9042 genuinely exceeds the NVR extractables limit (a true material attribute), most plausibly due to a supplier post-cure process change, with a discrepancy against the supplier CoA that requires supplier follow-up.",
          ].join("\n")
        ),
        regulatoryNotification:
          "Not Applicable at this stage. This is an incoming raw-material rejection with no material released to production and no finished device or distributed product involved; a supplier corrective-action request will be raised, but no regulatory notification is required.",
      },
      analyze: {
        ...EMPTY_CONTENT.analyze,
        sixM: {
          man: "The incoming-QC analyst (Emp. ID: 1201) is qualified on SOP/QC/044 and performed the test correctly; the result was confirmed on re-test. No man-related contributing factor.",
          machine: "The extractables balance and glassware are calibrated/qualified; the solvent blank and reference control were within acceptance, confirming the workstation performed correctly. No machine-related contributing factor.",
          measurement: "The test method SOP/QC/044 was verified within this investigation (blank + reference control), and duplicate re-tests were consistent (3.5 and 3.7 mg/100 cm2). The measurement system is sound and the result is a true material attribute. No measurement-related contributing factor.",
          material: "Silicone tubing lot SL-9042 (supplier SUP-118) exceeds the NVR extractables limit while prior lots were within limits — a step change. A supplier post-cure (secondary bake) process change was notified shortly before this shipment. Material/supplier is the confirmed contributing factor.",
          method: "The internal incoming-inspection method was followed correctly. However, the supplier-change control did not trigger enhanced incoming scrutiny or a requalification of the changed post-cure process before accepting shipments, which is a method/quality-system contributing factor.",
          milieu: "Incoming-goods storage conditions and lab environment were within range; no environmental contributing factor.",
          conclusion:
            "The confirmed contributing factors are Material (a true elevated-extractables attribute of lot SL-9042, plausibly from a supplier post-cure change) and Method (supplier-change control did not trigger enhanced incoming scrutiny/requalification). Man, Machine, Measurement, and Milieu did not contribute.",
        },
        fiveWhy: {
          narrative: emptyDoc(),
          conclusion: "",
        },
        brainstorming:
          "The supplier-quality team (Incoming QC, QA, Supplier Quality) brainstormed possible causes of the elevated extractables: (a) incoming test method or analyst error; (b) balance/glassware contamination; (c) sample cross-contamination or improper storage; (d) a genuine elevated-extractables material attribute of the lot; (e) a supplier process change (e.g., incomplete post-cure); (f) a supplier CoA/testing discrepancy. The method verification and reference control eliminated (a) and (b); storage/receipt review eliminated (c). Duplicate re-tests confirmed (d) as a true attribute. The supplier's notified post-cure change and the CoA discrepancy pointed to (e) as the most probable cause and (f) as a required supplier follow-up.",
        otherTools: "",
        investigationOutcome: legacyStringToDoc(
          [
            "The investigation was driven through the DMAIC methodology using the 6M method and a structured Brainstorming session as the root-cause tools, supported by a method-verification experiment (EXP-26-021). Based on the initial risk assessment, the deviation was categorized as 'Minor' because the nonconforming material was contained at incoming inspection with no release to production.",
            "The tools converge on a true elevated-extractables material attribute of lot SL-9042 as the assignable cause, most plausibly resulting from a supplier post-cure process change, with a contributing quality-system gap in supplier-change control and a CoA discrepancy requiring supplier corrective action.",
          ].join("\n")
        ),
        rootCause: {
          narrative: legacyStringToDoc(
            [
              "Primary Root Cause (Level 1): Material / Supplier — lot SL-9042 has a true elevated NVR extractables attribute, most plausibly due to an incomplete/changed post-cure (secondary bake) step at the supplier.",
              "Secondary Root Cause (Level 2): Method / Quality system — the supplier-change control process did not trigger enhanced incoming scrutiny or requalification of the changed post-cure process before accepting shipments.",
              "Third Root Cause (Level 3): Supplier data — a discrepancy between the supplier CoA (1.4 mg/100 cm2) and the incoming result (3.6 mg/100 cm2) indicates a supplier testing/release gap requiring corrective action.",
            ].join("\n")
          ),
        },
        impactAssessment: legacyStringToDoc(
          [
            "System: The incoming-inspection control detected the nonconformance and prevented release to production, as designed. The gap is in supplier-change control, addressed in CAPA.",
            "Document: SPEC-RM-SIL-08 and the supplier-change-control SOP require review to add enhanced-scrutiny triggers on notified supplier process changes; no other documents impacted.",
            "Product: No finished device is affected; nonconforming material lot SL-9042 is held in quarantine and none was issued to production.",
            "Equipment: No equipment impact.",
            "Patient safety / Past batches: No distributed product affected. Prior lots of RM-SIL-08 were within limits, and a review of any in-house tubing from earlier shipments is included as a corrective action to confirm no earlier post-cure-affected lots were accepted.",
          ].join("\n")
        ),
      },
      improve: {
        narrative: emptyDoc(),
        correctiveActions: legacyStringToDoc(
          [
            "CA-26-030: Reject silicone tubing lot SL-9042 per the nonconforming-material procedure and return or destroy per the supplier agreement. Responsible: Incoming-QC Executive (Emp. ID: 1201). Due: 05/03/2026. Expected outcome (verifiable): a documented nonconforming-material/rejection record and confirmed quarantine of all six reels.",
            "CA-26-031: Raise a Supplier Corrective Action Request (SCAR) to SUP-118 addressing both the elevated-extractables lot and the CoA discrepancy, and require the supplier's root cause for the post-cure change. Responsible: Supplier Quality Officer (Emp. ID: 577). Due: 12/03/2026. Expected outcome: an issued SCAR with a supplier response due date and a requested supplier root-cause/CAPA.",
            "CA-26-032: Verify the extractables status of any RM-SIL-08 tubing from the same supplier shipment or received after the notified post-cure change, and quarantine any additional affected lots. Responsible: QA Officer (Emp. ID: 604). Due: 10/03/2026. Expected outcome: a documented lot-by-lot verification confirming no other affected lots, or quarantine of any that are.",
            "The corrective actions are achievable with existing incoming-QC and supplier-quality resources.",
          ].join("\n")
        ),
      },
      control: {
        preventiveActions: legacyStringToDoc(
          [
            "PA-26-040 (CAPA No. CAPA-26-012): Revise the supplier-change-control SOP so that a notified supplier process change affecting a critical material attribute (e.g., a silicone post-cure change affecting extractables) triggers enhanced incoming testing and a documented requalification of the first post-change lots before routine acceptance. Linked to the Level 2 root cause. Responsible: Supplier Quality Manager (Emp. ID: 288). Due: 30/04/2026. Expected outcome (verifiable): a revised, approved SOP with defined enhanced-scrutiny triggers and a requalification requirement.",
            "PA-26-041 (CAPA No. CAPA-26-012): Based on the SCAR outcome, require SUP-118 to implement process control and release testing on the post-cure step so CoA results reliably reflect extractables, and verify through the next three received lots. Linked to the Level 1/Level 3 root cause. Responsible: Supplier Quality Officer (Emp. ID: 577). Due: 15/06/2026. Expected outcome: supplier corrective action confirmed and the next three lots within limits with matching CoA.",
            "Effectiveness verification: Required. Verification will start after both preventive actions are implemented and will review incoming extractables results and CoA agreement for the next five received lots of RM-SIL-08 from SUP-118. Acceptance criterion: all five lots within the NVR limit with incoming results agreeing with the supplier CoA within the method's expected variability, and enhanced scrutiny applied to any further notified change. Responsible: QA Manager (Emp. ID: 288). Tracked under CAPA-26-012.",
            "Interim plan: Until the revised supplier-change control is in force, 100% incoming extractables testing (rather than reduced/skip-lot) will be applied to all RM-SIL-08 lots from SUP-118, communicated by quality instruction QI-26-005 on 28/02/2026. This maintains control during CAPA implementation.",
            "Impact assessment (closure): Regulatory Impact — none. Regulatory notification — not required. Product Quality — no impact; nonconforming material contained at incoming and not released. Validation — supplier requalification to be performed under the revised change control. Stability — not applicable; no product manufactured with this material. Market / Clinical — no impact; no distributed product.",
            "Recommended lot disposition: Silicone tubing lot SL-9042 to be rejected; any other affected lots from the same shipment or post-change period to be quarantined and dispositioned on test results. This disposition matches the investigation conclusion and impact assessment.",
            "Final comments: The exceedance is a true elevated-extractables attribute of lot SL-9042, most plausibly from a supplier post-cure change, detected by incoming inspection and compounded by a supplier-change-control gap and a CoA discrepancy. Corrective actions reject the lot and raise a SCAR; preventive actions add enhanced-scrutiny triggers and supplier process/release-testing controls with effectiveness verification. CAPA-26-012 tracks implementation.",
          ].join("\n")
        ),
      },
      conclusion: {
        narrative: legacyStringToDoc(
          [
            "Root cause: silicone tubing lot SL-9042 has a true elevated NVR extractables attribute (3.6 mg/100 cm2 vs. NMT 2.0), most plausibly caused by a supplier post-cure (secondary bake) process change, and a contributing quality-system gap in supplier-change control together with a supplier CoA discrepancy.",
            "Final scope and impact: contained to incoming lot SL-9042 (held in quarantine); no material was released to production and no finished device or distributed product is affected. Prior lots from the supplier were within limits.",
            "Disposition: lot SL-9042 will be rejected and returned or destroyed per the supplier agreement; a SCAR will be raised to SUP-118 for the exceedance and the CoA discrepancy, and any other affected lots will be quarantined and dispositioned on test results.",
            "Closure: no regulatory notification is required. CAPA-26-012 (enhanced supplier-change scrutiny, supplier process/release-testing controls, and effectiveness verification) tracks the preventive actions. The investigation is complete pending CAPA implementation and the supplier response.",
          ].join("\n")
        ),
      },
    },
  },
];

function mergeSections(partial: Partial<SectionContentMap>): SectionContentMap {
  const out = structuredClone(EMPTY_CONTENT);
  for (const section of REPORT_SECTION_ROW_ORDER) {
    const patch = partial[section];
    if (!patch) continue;
    (out as Record<string, unknown>)[section] = {
      ...(out[section] as object),
      ...(patch as object),
    };
  }
  return out;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: workspaceUsers.id })
    .from(workspaceUsers)
    .where(eq(workspaceUsers.email, email.toLowerCase()))
    .limit(1);
  return row?.id ?? null;
}

function titleForRole(role: DemoUserRole): string {
  switch (role) {
    case "engineer":
      return "Engineer";
    case "manager":
      return "Manager";
    case "admin":
      return "Admin";
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  // "sachin+manager" → "Sachin Manager"
  const parts = local.split(/[._+\-]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

async function ensureDemoUser(email: string, role: DemoUserRole): Promise<string> {
  const existingId = await findUserIdByEmail(email);
  if (existingId) {
    await db
      .update(workspaceUsers)
      .set({
        role,
        title: titleForRole(role),
        name: displayNameFromEmail(email),
        deactivatedAt: null,
      })
      .where(eq(workspaceUsers.id, existingId));
    return existingId;
  }

  const policy = await getPasswordPolicy();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const id = createId();

  await db.insert(workspaceUsers).values({
    id,
    name: displayNameFromEmail(email),
    email: email.toLowerCase(),
    role,
    title: titleForRole(role),
    passwordHash,
    mustChangePassword: true,
    passwordChangedAt: new Date(),
    failedLoginAttempts: 0,
    lockedAt: null,
    passwordExpiryWarningDismissedUntil: null,
    passwordHistory: initialPasswordHistory(passwordHash, policy.passwordHistoryLimit),
  });

  console.log(`Created demo user ${email} (${role}) — password: ${DEMO_PASSWORD}`);
  return id;
}

async function removeLegacyDemoUsers(
  primaryEngineerId: string,
  primaryManagerId: string
): Promise<void> {
  for (const email of LEGACY_DEMO_EMAILS) {
    const legacyId = await findUserIdByEmail(email);
    if (!legacyId) continue;

    const toReassign = await db
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.authorId, legacyId));
    if (toReassign.length > 0) {
      await db
        .update(reports)
        .set({ authorId: primaryEngineerId, updatedAt: new Date() })
        .where(eq(reports.authorId, legacyId));
      console.log(
        `Reassigned ${toReassign.length} report(s) from ${email} → ${PRIMARY_ENGINEER_EMAIL}`
      );
    }

    await db
      .update(reports)
      .set({ assignedManagerId: primaryManagerId, updatedAt: new Date() })
      .where(eq(reports.assignedManagerId, legacyId));
    await db
      .update(reports)
      .set({ reviewedById: primaryManagerId, updatedAt: new Date() })
      .where(eq(reports.reviewedById, legacyId));

    const mgrLinks = await db
      .select({ reportId: reportManagers.reportId })
      .from(reportManagers)
      .where(eq(reportManagers.managerId, legacyId));
    for (const link of mgrLinks) {
      await db
        .delete(reportManagers)
        .where(
          and(
            eq(reportManagers.reportId, link.reportId),
            eq(reportManagers.managerId, legacyId)
          )
        );
      const [existing] = await db
        .select({ reportId: reportManagers.reportId })
        .from(reportManagers)
        .where(
          and(
            eq(reportManagers.reportId, link.reportId),
            eq(reportManagers.managerId, primaryManagerId)
          )
        )
        .limit(1);
      if (!existing) {
        await insertReportManagers(link.reportId, [primaryManagerId]);
      }
    }

    await db.delete(workspaceUsers).where(eq(workspaceUsers.id, legacyId));
    console.log(`Removed legacy demo user ${email}`);
  }
}

function formatDatabaseTarget(url: string): string {
  try {
    const parsed = new URL(url.replace(/^postgres:\/\//, "postgresql://"));
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  console.log(`Target database: ${formatDatabaseTarget(databaseUrl)}`);

  const userIds = new Map<string, string>();
  for (const user of DEMO_USERS) {
    const id = await ensureDemoUser(user.email, user.role);
    userIds.set(user.email, id);
    console.log(`Ready ${user.email} (${user.role})`);
  }

  const engineerId = userIds.get(PRIMARY_ENGINEER_EMAIL);
  const managerId = userIds.get(PRIMARY_MANAGER_EMAIL);
  if (!engineerId || !managerId) {
    throw new Error("Primary demo engineer/manager ids missing after ensure");
  }

  await removeLegacyDemoUsers(engineerId, managerId);

  // Refresh demo content: remove any of the demo engineer's reports that are
  // not in the curated set (e.g. earlier thin seed reports). Scoped strictly to
  // the demo engineer so no other author's reports are ever touched. Child rows
  // (sections, evaluations, comments, managers) cascade on report delete.
  const wantedDeviationNos = DEMO_REPORTS.map((r) => r.deviationNo);
  const stale = await db
    .select({ id: reports.id, deviationNo: reports.deviationNo })
    .from(reports)
    .where(
      and(
        eq(reports.authorId, engineerId),
        notInArray(reports.deviationNo, wantedDeviationNos)
      )
    );
  if (stale.length > 0) {
    await db.delete(reports).where(
      inArray(
        reports.id,
        stale.map((r) => r.id)
      )
    );
    for (const r of stale) console.log(`Removed stale demo report ${r.deviationNo}`);
  }

  let created = 0;
  let updated = 0;
  for (const spec of DEMO_REPORTS) {
    const content = mergeSections(spec.sections);
    const sectionRows = REPORT_SECTION_ROW_ORDER.map((section) => ({
      section,
      content: content[section] as unknown as Record<string, unknown>,
    }));

    // Scope updates strictly to the demo engineer's reports so re-running only
    // ever touches demo content, never any other author's reports.
    const [existing] = await db
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(eq(reports.authorId, engineerId), eq(reports.deviationNo, spec.deviationNo))
      )
      .limit(1);

    if (existing) {
      await db
        .update(reports)
        .set({
          status: spec.status,
          toolsUsed: spec.toolsUsed,
          otherTools: spec.otherTools ?? "",
          assignedManagerId: managerId,
          reviewedById: spec.status === "approved" ? managerId : null,
          updatedAt: new Date(),
        })
        .where(eq(reports.id, existing.id));

      await db.delete(reportSections).where(eq(reportSections.reportId, existing.id));
      await db.insert(reportSections).values(
        sectionRows.map((row) => ({ reportId: existing.id, ...row }))
      );

      const [mgr] = await db
        .select({ managerId: reportManagers.managerId })
        .from(reportManagers)
        .where(eq(reportManagers.reportId, existing.id))
        .limit(1);
      if (!mgr) await insertReportManagers(existing.id, [managerId]);

      updated += 1;
      console.log(`Updated ${spec.deviationNo} — ${spec.title} (${spec.status})`);
      continue;
    }

    const [report] = await db
      .insert(reports)
      .values({
        deviationNo: spec.deviationNo,
        authorId: engineerId,
        assignedManagerId: managerId,
        status: spec.status,
        toolsUsed: spec.toolsUsed,
        otherTools: spec.otherTools ?? "",
        reviewedById: spec.status === "approved" ? managerId : null,
      })
      .returning();

    if (!report) throw new Error(`Failed to insert ${spec.deviationNo}`);

    await insertReportManagers(report.id, [managerId]);
    await db.insert(reportSections).values(
      sectionRows.map((row) => ({ reportId: report.id, ...row }))
    );

    created += 1;
    console.log(`Created ${spec.deviationNo} — ${spec.title} (${spec.status})`);
  }

  console.log(`Done. ${created} created, ${updated} updated.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
