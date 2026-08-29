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

export function stepsForRole(
  role: UserRole,
  copy: ProductTourCopyContext
): ProductTourStep[] {
  const name = copy.productName;
  const noun = documentNoun(copy.documentTypeLabels);
  const reportsHref = reportsHomeHref(role);

  const welcome: ProductTourStep = {
    id: "welcome",
    title: `Welcome to ${name}`,
    body: welcomeBody(role, name, noun),
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
          body: `New Report opens a draft. Give it a document number and optionally assign reviewers. You can also import an existing Word file when that is enabled.`,
          startHere: true,
          href: "/",
          match: (pathname) => pathname === "/",
          target: "create-report",
        },
        {
          id: "editor",
          title: "Write in the editor",
          body: "Each section auto-saves as you type. Work through the document in order — you do not need to finish it in one sitting.",
          startHere: true,
          target: "report-editor",
          match: isReportWorkspace,
        },
        {
          id: "ai-check",
          title: "Run AI Check",
          body: "When a section has content, Run criteria scores it against the quality checklist (green / yellow / red) and can suggest fixes.",
          startHere: true,
          target: "ai-check",
          match: isReportWorkspace,
        },
        {
          id: "assistant",
          title: "Ask the Assistant",
          body: "The right-hand Assistant can read the report, search attached evidence, and propose edits. Use it when you are stuck or need a draft.",
          target: "assistant",
          match: isReportWorkspace,
        },
        {
          id: "attachments",
          title: "Attach evidence",
          body: "Upload PDFs or Word files on the left. Once they finish processing, the Assistant can search them instead of asking you for facts that are already in the file.",
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
        {
          id: "insights",
          title: "Insights",
          body: "Dashboards for quality trends, common pitfalls, and management reporting. Use these after you have a body of reports.",
          href: "/insights/dashboard",
          match: (pathname) => pathname.startsWith("/insights"),
          target: "insights-tabs",
        },
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
          body: "Submitted and in-review reports appear here. Open one to comment, return it, or approve.",
          startHere: true,
          href: "/",
          match: (pathname) => pathname === "/",
          target: "nav-reports",
        },
        {
          id: "review",
          title: "Review the document",
          body: "Read the report, leave comments in the margin, and turn on Track changes if you need to edit the engineer’s text.",
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
          body: "The sidebar still has the Assistant, criteria traffic lights, and comments so you can see what the AI flagged before you decide.",
          target: "assistant",
          match: isReportWorkspace,
        },
        {
          id: "export",
          title: "Export to Word",
          body: "Export DOCX if you need a Word copy for the quality system or for offline reading.",
          target: "export-docx",
          match: isReportWorkspace,
        },
        {
          id: "insights",
          title: "Insights",
          body: "Dashboards for review load, pitfalls, and management reporting.",
          href: "/insights/dashboard",
          match: (pathname) => pathname.startsWith("/insights"),
          target: "insights-tabs",
        },
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
          body: "QA has a read-only view of every report. Open one to read it or follow the audit trail — you cannot edit or approve.",
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
        {
          id: "insights",
          title: "Insights",
          body: "Dashboards for quality trends and common pitfalls across the workspace.",
          href: "/insights/dashboard",
          match: (pathname) => pathname.startsWith("/insights"),
          target: "insights-tabs",
        },
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

function welcomeBody(role: UserRole, name: string, noun: string): string {
  switch (role) {
    case "engineer":
      return `Start by creating a ${noun} report, writing in the editor (it auto-saves), running AI Check, then submitting for review. This short tour also covers the Assistant, attachments, Word export, and Insights.`;
    case "manager":
      return `Your queue is submitted ${noun} reports. Open one, comment, then approve or send it back. This tour also covers Track changes, the Assistant, export, and Insights.`;
    case "qa":
      return `${name} gives QA a read-only view of reports and audit trails. This tour points at the list, audit history, and Insights.`;
    case "admin":
      return `You manage workspace reports, user accounts, and password policy. This tour points at those two admin screens.`;
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
