import type { UserRole } from "@/lib/auth/roles";
import type {
  ProductTourCopyContext,
  ProductTourStep,
} from "@/lib/walkthrough/types";

function documentNoun(labels: string[]): string {
  if (labels.length === 0) return "report";
  if (labels.length === 1) {
    return labels[0]?.replace(/ report$/i, "").toLowerCase() ?? "report";
  }
  return "report";
}

function reportsHomeHref(role: UserRole): string {
  return role === "admin" ? "/admin/reports" : "/";
}

function isReportsHome(pathname: string, role: UserRole): boolean {
  if (role === "admin") {
    return pathname === "/admin/reports" || pathname.startsWith("/admin/reports/");
  }
  return pathname === "/";
}

function isReportWorkspace(pathname: string): boolean {
  return (
    /^\/reports\/[^/]+\/(edit|review)\/?$/.test(pathname) ||
    /^\/admin\/reports\/[^/]+\/?$/.test(pathname)
  );
}

function joinFeatures(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function vaultStep(role: UserRole): ProductTourStep {
  const body =
    role === "qa"
      ? "Workspace files live here. Open PDFs and Word files, follow folders, and see what has been shared with you. Linking a vault file into a report does not store it twice."
      : "Workspace files live here. Upload files or folders, organize them, share with coworkers, and archive what you do not need. Linking a vault file into a report does not store it twice.";
  return {
    id: "vault",
    title: "Document vault",
    body,
    href: "/vault",
    match: (pathname) => pathname === "/vault" || pathname.startsWith("/vault/"),
    target: "nav-vault",
  };
}

function analyticsStep(): ProductTourStep {
  return {
    id: "analytics",
    title: "Analytics worksheet",
    body: "Analytics sits beside the document. Paste or extract measurements, then plot a sixpack, scatter, histogram, boxplot, or ANOVA. Ask the Assistant to fill the grid when you do not want to type values by hand.",
    target: "analytics",
    match: isReportWorkspace,
  };
}

function insightsStep(): ProductTourStep {
  return {
    id: "insights",
    title: "Insights",
    body: "Dashboards for quality trends, common pitfalls, and management reporting. Use these after you have a body of reports.",
    href: "/insights",
    match: (pathname) => pathname.startsWith("/insights"),
    target: "insights-tabs",
  };
}

function optionalPackSteps(copy: ProductTourCopyContext): {
  analytics: ProductTourStep[]
  insights: ProductTourStep[]
} {
  return {
    analytics: copy.statisticalAnalysisEnabled ? [analyticsStep()] : [],
    insights: copy.insightsEnabled ? [insightsStep()] : [],
  };
}

export function stepsForRole(
  role: UserRole,
  copy: ProductTourCopyContext
): ProductTourStep[] {
  const name = copy.productName;
  const noun = documentNoun(copy.documentTypeLabels);
  const reportsHref = reportsHomeHref(role);
  const extras = optionalPackSteps(copy);

  const welcome: ProductTourStep = {
    id: "welcome",
    title: "Welcome to Andrei",
    body: welcomeBody(role, name, noun, copy),
    startHere: true,
  };

  const done: ProductTourStep = {
    id: "done",
    title: "You're ready to go",
    body: `You can replay this tour anytime from Profile. ${name} saves your progress as you work.`,
  };

  switch (role) {
    case "engineer":
      return [
        welcome,
        {
          id: "reports",
          title: "Your reports live here",
          body: `This is home. Open a draft to keep writing, or start a new ${noun} report.`,
          startHere: true,
          href: reportsHref,
          match: (pathname) => isReportsHome(pathname, role),
          target: "nav-reports",
        },
        {
          id: "create-report",
          title: "Start here: create a report",
          body: `New Report opens a draft. Give it a document number and optionally assign reviewers. You can also import an existing Word file when that is enabled. The next cards appear once you open the report.`,
          startHere: true,
          href: "/",
          match: (pathname) => pathname === "/",
          target: "create-report",
        },
        {
          id: "chrome",
          title: "Document or Agent",
          body: "New reports open in Agent. Switch to Document when you want to write yourself. The same Assistant can talk about the report or about Analytics.",
          startHere: true,
          target: "workspace-chrome",
          match: isReportWorkspace,
        },
        {
          id: "editor",
          title: "Write in the editor",
          body: "Each section auto-saves as you type. History on the tab strip compares versions. You do not need to finish the document in one sitting.",
          startHere: true,
          target: "report-editor",
          match: isReportWorkspace,
        },
        {
          id: "ai-check",
          title: "Run AI Check",
          body: "When a section has content, Run criteria scores it against the quality checklist (green / yellow / red) and can suggest fixes. Apply or Dismiss each one, or Apply all from the header.",
          startHere: true,
          target: "ai-check",
          match: isReportWorkspace,
        },
        {
          id: "assistant",
          title: "Ask the Assistant",
          body: "The Assistant can read the report, search attached evidence, and propose edits you Apply or Dismiss. Click a citation to open that file. Use the mic next to the composer to dictate instead of typing.",
          target: "assistant",
          match: isReportWorkspace,
        },
        ...extras.analytics,
        {
          id: "attachments",
          title: "Attach evidence",
          body: "Upload PDFs or Word files on the left, or link files already in the Document vault. Once they finish processing, the Assistant can search them. Citations open the matching file tab.",
          target: "documents",
          match: isReportWorkspace,
        },
        {
          id: "submit",
          title: "Submit for review",
          body: "When the draft is ready, submit it to your assigned managers. They can comment, return it with feedback, or approve.",
          target: "submit-review",
          match: isReportWorkspace,
        },
        {
          id: "export",
          title: "Export to Word",
          body: "Export DOCX anytime — including before submit — using the current template and your latest saved content.",
          target: "export-docx",
          match: isReportWorkspace,
        },
        vaultStep(role),
        ...extras.insights,
        {
          id: "profile",
          title: "Profile and password",
          body: "Update your password, notification preferences, and replay this tour from Profile.",
          href: "/profile",
          match: (pathname) => pathname.startsWith("/profile"),
          target: "nav-profile",
        },
        done,
      ];
    case "manager":
      return [
        welcome,
        {
          id: "reports",
          title: "Your review queue",
          body: "Submitted and in-review reports appear here. Open one to comment, return it, or approve. The next cards appear once you open a report.",
          startHere: true,
          href: "/",
          match: (pathname) => pathname === "/",
          target: "nav-reports",
        },
        {
          id: "review",
          title: "Review the document",
          body: "Read the report, leave comments in the margin, and turn on Track changes if you need to edit the engineer’s text. Switch Document | Agent the same way the engineer does.",
          startHere: true,
          target: "report-editor",
          match: isReportWorkspace,
        },
        {
          id: "review-actions",
          title: "Approve or send back",
          body: "Return with Feedback sends the report back to the engineer. Approve signs it off. Both require your password.",
          startHere: true,
          target: "review-actions",
          match: isReportWorkspace,
        },
        {
          id: "assistant",
          title: "Assistant and criteria",
          body: "The sidebar still has the Assistant, criteria traffic lights, and comments so you can see what the AI flagged before you decide. Click a citation to open the file.",
          target: "assistant",
          match: isReportWorkspace,
        },
        ...extras.analytics,
        {
          id: "export",
          title: "Export to Word",
          body: "Export DOCX if you need a Word copy for the quality system or for offline reading.",
          target: "export-docx",
          match: isReportWorkspace,
        },
        vaultStep(role),
        ...extras.insights,
        {
          id: "profile",
          title: "Profile and password",
          body: "Update your password and replay this tour from Profile.",
          href: "/profile",
          match: (pathname) => pathname.startsWith("/profile"),
          target: "nav-profile",
        },
        done,
      ];
    case "qa":
      return [
        welcome,
        {
          id: "reports",
          title: "All reports",
          body: "QA has a read-only view of every report. Open one to read it or follow the audit trail — you cannot edit or approve. The next cards appear once you open a report.",
          startHere: true,
          href: "/",
          match: (pathname) => pathname === "/",
          target: "nav-reports",
        },
        {
          id: "audit",
          title: "Audit trail",
          body: "Each report has an Audit Trail of who changed what. Use it when you need a Part 11-style history.",
          startHere: true,
          target: "audit-trail",
          match: isReportWorkspace,
        },
        vaultStep(role),
        ...extras.insights,
        {
          id: "profile",
          title: "Profile and password",
          body: "Update your password and replay this tour from Profile.",
          href: "/profile",
          match: (pathname) => pathname.startsWith("/profile"),
          target: "nav-profile",
        },
        done,
      ];
    case "admin":
      return [
        welcome,
        {
          id: "reports",
          title: "Workspace reports",
          body: "Admins can browse every report, including deleted ones, and purge records according to retention policy.",
          startHere: true,
          href: "/admin/reports",
          match: (pathname) =>
            pathname === "/admin/reports" || pathname.startsWith("/admin/reports/"),
          target: "nav-reports",
        },
        vaultStep(role),
        {
          id: "users",
          title: "Users and policy",
          body: "Create accounts, reset or unlock passwords, and set password expiry and inactivity timeout for the workspace.",
          startHere: true,
          href: "/admin/users",
          match: (pathname) => pathname.startsWith("/admin/users"),
          target: "nav-users",
        },
        {
          id: "profile",
          title: "Your profile",
          body: "Your own password and a replay of this tour live under Profile.",
          href: "/profile",
          match: (pathname) => pathname.startsWith("/profile"),
          target: "nav-profile",
        },
        done,
      ];
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

function welcomeBody(
  role: UserRole,
  name: string,
  noun: string,
  copy: ProductTourCopyContext
): string {
  const more = joinFeatures([
    "the Assistant (including voice)",
    ...(copy.statisticalAnalysisEnabled ? ["Analytics"] : []),
    "the document vault",
    "Word export",
    ...(copy.insightsEnabled ? ["Insights"] : []),
  ]);

  switch (role) {
    case "engineer":
      return `Start by creating a ${noun} report. New reports open in Agent — switch to Document to write yourself. Write in the editor (it auto-saves), run AI Check, then submit for review. This short tour also covers ${more}.`;
    case "manager":
      return `Your queue is submitted ${noun} reports. Open one, comment, then approve or send it back. This tour also covers Track changes, ${more}.`;
    case "qa":
      return `${name} gives QA a read-only view of reports and audit trails. This tour points at the list, audit history, the document vault${copy.insightsEnabled ? ", and Insights" : ""}.`;
    case "admin":
      return `You manage workspace reports, the document vault, user accounts, and password policy. This tour points at those screens.`;
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

export function resolveStepIndex(
  steps: ProductTourStep[],
  stepId: string | null | undefined
): number {
  if (!stepId) return 0;
  const index = steps.findIndex((step) => step.id === stepId);
  return index >= 0 ? index : 0;
}

/** Unanchored cards (no `match`) can show on any page. */
export function productTourStepIsOnPage(
  step: ProductTourStep,
  pathname: string
): boolean {
  return !step.match || step.match(pathname);
}

/**
 * Keep the current card until its page is open. If the user already left for a
 * later card's page (opened a report, vault, …), resume at that later card.
 *
 * Do not skip while still on the previous card's page — Next to vault would
 * otherwise jump to the next report-only card before `/vault` loads.
 */
export function resumeTourIndexForPathname(
  steps: ProductTourStep[],
  currentIndex: number,
  pathname: string
): number {
  const current = steps[currentIndex];
  if (!current) return currentIndex;
  if (productTourStepIsOnPage(current, pathname)) return currentIndex;

  const previous = currentIndex > 0 ? steps[currentIndex - 1] : undefined;
  if (previous?.match?.(pathname)) return currentIndex;

  for (let i = currentIndex + 1; i < steps.length; i++) {
    const candidate = steps[i];
    if (candidate?.match?.(pathname)) return i;
  }
  return currentIndex;
}
