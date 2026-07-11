/**
 * Seed demo investigation reports for the Andrei whitelabel.
 *
 *   pnpm seed-demo-reports
 *
 * Requires demo users (created automatically if missing):
 *   engineer@company.com / manager@company.com — password DemoPass123!
 */
import { config } from "dotenv";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
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

config({ path: ".env" });
config({ path: ".env.local", override: true });

const ENGINEER_EMAIL = "engineer@company.com";
const MANAGER_EMAIL = "manager@company.com";
const DEMO_PASSWORD = "DemoPass123!";

type DemoReportSpec = {
  deviationNo: string;
  title: string;
  status: "draft" | "submitted" | "in_review" | "approved";
  toolsUsed: { sixM: boolean; fiveWhy: boolean; brainstorming: boolean };
  sections: Partial<SectionContentMap>;
};

const DEMO_REPORTS: DemoReportSpec[] = [
  {
    deviationNo: "DEV-2026-001",
    title: "HPLC peak tailing during release testing",
    status: "draft",
    toolsUsed: { sixM: true, fiveWhy: false, brainstorming: false },
    sections: {
      define: {
        narrative: legacyStringToDoc(
          "On 03/03/2026 at 14:20, during release testing of Batch B-240311 in the analytical lab, asymmetric peak tailing was observed on the main product peak. Expected symmetry factor NMT 1.5; observed 2.1. Initial scope limited to Batch B-240311 and the HPLC system used (ID: HPLC-07)."
        ),
      },
      measure: {
        experimentNumber: "EXP-2026-014",
        experimentTitle: "Column performance verification",
        purpose: legacyStringToDoc(
          "Verify whether the installed column still meets system suitability after repeated injections."
        ),
        conclusion: legacyStringToDoc(
          "Column efficiency had declined below the validated range; replacement restored acceptable peak shape."
        ),
        narrative: legacyStringToDoc(
          "Reviewed chromatograms, column logbook, and mobile phase preparation records. No changes to method parameters were identified."
        ),
      },
      analyze: {
        ...EMPTY_CONTENT.analyze,
        sixM: {
          man: "Analyst followed approved method; no training gaps identified.",
          machine: "Column age exceeded recommended injection count.",
          measurement: "System suitability met except peak symmetry.",
          material: "Mobile phase prepared within specification.",
          method: "Validated method unchanged.",
          milieu: "Lab temperature within range.",
          conclusion: "Primary factor: column degradation.",
        },
        rootCause: {
          narrative: legacyStringToDoc(
            "Root cause: continued use of HPLC column beyond its qualified injection limit, leading to peak tailing."
          ),
        },
        investigationOutcome: legacyStringToDoc("Confirmed assignable cause; no product quality impact on tested batch."),
        impactAssessment: legacyStringToDoc(
          "Product: isolated to single batch under investigation. Equipment: HPLC-07 quarantined pending column replacement."
        ),
      },
      improve: {
        narrative: emptyDoc(),
        correctiveActions: legacyStringToDoc(
          "CA-001: Replace column on HPLC-07 and requalify system suitability before resuming release testing. Responsible: Lab lead. Due: 10/03/2026."
        ),
      },
      control: {
        preventiveActions: legacyStringToDoc(
          "PA-001: Update column lifecycle tracking to block use after maximum injection count. PA-002: Add monthly review of column usage dashboards."
        ),
      },
      conclusion: {
        narrative: legacyStringToDoc(
          "Investigation concluded that column lifecycle exceedance caused peak tailing. Batch B-240311 remains on hold pending repeat testing after column replacement. No regulatory notification required."
        ),
      },
    },
  },
  {
    deviationNo: "DEV-2026-002",
    title: "Temperature excursion in stability chamber",
    status: "submitted",
    toolsUsed: { sixM: false, fiveWhy: true, brainstorming: false },
    sections: {
      define: {
        narrative: legacyStringToDoc(
          "On 18/02/2026 at 02:15, a stability chamber alarm indicated temperature above 25°C for Study STB-118. Detected at 06:40 by monitoring system."
        ),
      },
      measure: {
        narrative: legacyStringToDoc(
          "Alarm logs, chamber maintenance records, and temperature traces for 72 hours before the event were reviewed."
        ),
      },
      analyze: {
        ...EMPTY_CONTENT.analyze,
        fiveWhy: {
          narrative: legacyStringToDoc(
            "1. Why did temperature rise? Compressor fault.\n2. Why did compressor fault occur? Worn relay.\n3. Why was relay worn? Preventive maintenance interval not triggered.\n4. Why was PM missed? Asset not enrolled in CMMS schedule.\n5. Why not enrolled? New chamber commissioning checklist incomplete."
          ),
          conclusion: "",
        },
        rootCause: {
          narrative: legacyStringToDoc("Incomplete commissioning left chamber outside preventive maintenance program."),
        },
        investigationOutcome: legacyStringToDoc("Assign root cause to CMMS onboarding gap."),
        impactAssessment: legacyStringToDoc("Stability samples exposed 4h above limit; impact assessment ongoing for affected intervals."),
      },
      improve: {
        narrative: emptyDoc(),
        correctiveActions: legacyStringToDoc(
          "CA-001: Repair chamber and validate temperature mapping. CA-002: Enroll all stability chambers in CMMS with PM schedules."
        ),
      },
      control: {
        preventiveActions: legacyStringToDoc(
          "PA-001: Commissioning checklist requires CMMS enrollment sign-off before chamber release."
        ),
      },
      conclusion: {
        narrative: legacyStringToDoc(
          "Temperature excursion linked to maintenance program gap. Affected study intervals under scientific review; disposition pending stability assessment."
        ),
      },
    },
  },
  {
    deviationNo: "DEV-2026-003",
    title: "Label artwork version mismatch",
    status: "in_review",
    toolsUsed: { sixM: true, fiveWhy: false, brainstorming: true },
    sections: {
      define: {
        narrative: legacyStringToDoc(
          "On 27/01/2026, packaging QA identified cartons printed with superseded artwork revision for Product P-204."
        ),
      },
      measure: {
        narrative: legacyStringToDoc(
          "Compared approved artwork master, printer proof, and retained samples from three lots."
        ),
      },
      analyze: {
        ...EMPTY_CONTENT.analyze,
        brainstorming: "Supplier changeover, file transfer error, approval workflow gap",
        rootCause: {
          narrative: legacyStringToDoc(
            "Printer received outdated PDF from shared drive; change control did not retire prior revision."
          ),
        },
        investigationOutcome: legacyStringToDoc("Human/process gap in document issuance control."),
        impactAssessment: legacyStringToDoc("Market safety risk low; mislabeling risk moderate for distributed units."),
      },
      improve: {
        narrative: emptyDoc(),
        correctiveActions: legacyStringToDoc(
          "CA-001: Recall and destroy affected printed cartons. CA-002: Issue controlled artwork package with checksum verification."
        ),
      },
      control: {
        preventiveActions: legacyStringToDoc(
          "PA-001: Automated issuance from document management system only; disable ad-hoc file shares for production artwork."
        ),
      },
      conclusion: {
        narrative: legacyStringToDoc(
          "Root cause confirmed as outdated artwork issuance. Affected cartons quarantined; relabeling authorized for in-process inventory only."
        ),
      },
    },
  },
  {
    deviationNo: "DEV-2026-004",
    title: "Cleaning verification failure",
    status: "approved",
    toolsUsed: { sixM: true, fiveWhy: false, brainstorming: false },
    sections: {
      define: {
        narrative: legacyStringToDoc(
          "On 05/12/2025, swab results for residual API exceeded limit on shared equipment SK-12 after product changeover."
        ),
      },
      measure: {
        experimentNumber: "EXP-2025-091",
        experimentTitle: "Swab recovery study",
        purpose: legacyStringToDoc("Confirm swab recovery factor for the updated cleaning agent."),
        conclusion: legacyStringToDoc("Recovery within validated range; cleaning failure not due to analytical method."),
        narrative: legacyStringToDoc(
          "Reviewed cleaning log, hold times, and operator execution against approved procedure."
        ),
      },
      analyze: {
        ...EMPTY_CONTENT.analyze,
        sixM: {
          man: "Operator certified on procedure.",
          machine: "Spray ball inspection overdue.",
          measurement: "Swab method validated.",
          material: "Cleaning agent lot within spec.",
          method: "Procedure required extended contact time not met.",
          milieu: "Not applicable.",
          conclusion: "Insufficient contact time during manual wash step.",
        },
        rootCause: {
          narrative: legacyStringToDoc("Cleaning cycle shortened to meet production schedule."),
        },
        investigationOutcome: legacyStringToDoc("Procedural non-conformance confirmed."),
        impactAssessment: legacyStringToDoc("No cross-contamination to next batch after repeat cleaning."),
      },
      improve: {
        narrative: emptyDoc(),
        correctiveActions: legacyStringToDoc(
          "CA-001: Repeat cleaning and verification. CA-002: Reinforce contact time in batch record with timer checkpoints."
        ),
      },
      control: {
        preventiveActions: legacyStringToDoc(
          "PA-001: Interlock changeover release on completed cleaning verification. PA-002: Annual cleaning effectiveness review."
        ),
      },
      conclusion: {
        narrative: legacyStringToDoc(
          "Investigation closed. Equipment released after successful repeat cleaning. No impact to distributed batches."
        ),
      },
    },
  },
  {
    deviationNo: "DEV-2026-005",
    title: "Data integrity audit trail gap",
    status: "draft",
    toolsUsed: { sixM: false, fiveWhy: true, brainstorming: false },
    sections: {
      define: {
        narrative: legacyStringToDoc(
          "On 22/03/2026, internal audit noted missing audit trail entries for parameter changes on System LIMS-03 during method update."
        ),
      },
      measure: {
        narrative: legacyStringToDoc(
          "Exported audit trail, compared to change ticket, and interviewed system administrator."
        ),
      },
      analyze: {
        ...EMPTY_CONTENT.analyze,
        fiveWhy: {
          narrative: legacyStringToDoc(
            "Why were entries missing? Audit trail disabled during maintenance window.\nWhy disabled? Vendor patch procedure required temporary disable.\nWhy not re-enabled? Runbook step omitted.\nWhy omitted? Runbook not updated for new patch version."
          ),
          conclusion: "",
        },
        rootCause: {
          narrative: legacyStringToDoc("Outdated vendor maintenance runbook."),
        },
        investigationOutcome: legacyStringToDoc("Data integrity gap confined to maintenance window."),
        impactAssessment: legacyStringToDoc("No evidence of unapproved production data changes."),
      },
      improve: {
        narrative: emptyDoc(),
        correctiveActions: legacyStringToDoc(
          "CA-001: Restore audit trail and reconcile changes. CA-002: Update runbook with explicit re-enable verification."
        ),
      },
      control: {
        preventiveActions: legacyStringToDoc(
          "PA-001: Dual verification before returning computerized systems to production use."
        ),
      },
      conclusion: {
        narrative: legacyStringToDoc(
          "Gap attributed to procedural documentation. System returned to validated state; enhanced checks added for maintenance activities."
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

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

async function ensureDemoUser(
  email: string,
  role: "engineer" | "manager"
): Promise<string> {
  const existingId = await findUserIdByEmail(email);
  if (existingId) return existingId;

  const policy = await getPasswordPolicy();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const id = createId();
  const title = role === "manager" ? "Manager" : "Engineer";

  await db.insert(workspaceUsers).values({
    id,
    name: displayNameFromEmail(email),
    email: email.toLowerCase(),
    role,
    title,
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

async function main() {
  const engineerId = await ensureDemoUser(ENGINEER_EMAIL, "engineer");
  const managerId = await ensureDemoUser(MANAGER_EMAIL, "manager");

  let created = 0;
  for (const spec of DEMO_REPORTS) {
    const existing = await db
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.deviationNo, spec.deviationNo))
      .limit(1);
    if (existing.length > 0) {
      console.log(`Skip ${spec.deviationNo} (already exists)`);
      continue;
    }

    const content = mergeSections(spec.sections);
    const [report] = await db
      .insert(reports)
      .values({
        deviationNo: spec.deviationNo,
        authorId: engineerId,
        assignedManagerId: managerId,
        status: spec.status,
        toolsUsed: spec.toolsUsed,
        otherTools: "",
        reviewedById: spec.status === "approved" ? managerId : null,
      })
      .returning();

    if (!report) throw new Error(`Failed to insert ${spec.deviationNo}`);

    await insertReportManagers(report.id, [managerId]);
    await db.insert(reportSections).values(
      REPORT_SECTION_ROW_ORDER.map((section) => ({
        reportId: report.id,
        section,
        content: content[section] as unknown as Record<string, unknown>,
      }))
    );

    created += 1;
    console.log(`Created ${spec.deviationNo} — ${spec.title} (${spec.status})`);
  }

  console.log(`Done. ${created} report(s) created.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
