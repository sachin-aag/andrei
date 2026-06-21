import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  exportAuditEventsCsv,
  exportAuditEventsPdf,
  listGlobalAuditSummary,
  verifyAuditChain,
} from "@/lib/audit";

async function requireAdminOrManager() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "admin" && user.role !== "manager") {
    return {
      user: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user, response: null };
}

export async function GET(req: Request) {
  const { user, response } = await requireAdminOrManager();
  if (response || !user) return response;

  const url = new URL(req.url);
  const format = url.searchParams.get("format");

  if (format === "csv") {
    const events = await listGlobalAuditSummary(5000);
    const csv = await exportAuditEventsCsv(events);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="global-audit-trail.csv"',
      },
    });
  }

  if (format === "pdf") {
    const events = await listGlobalAuditSummary(5000);
    const pdf = await exportAuditEventsPdf(events);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="global-audit-trail.pdf"',
      },
    });
  }

  const [events, chain] = await Promise.all([
    listGlobalAuditSummary(200),
    verifyAuditChain(),
  ]);

  return NextResponse.json({ events, chainVerification: chain });
}
