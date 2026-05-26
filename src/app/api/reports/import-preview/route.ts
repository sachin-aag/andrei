import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "engineer") {
      return NextResponse.json(
        { error: "Only engineers can create reports" },
        { status: 403 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "A .docx file is required" }, { status: 400 });
    }

    const { readDocxUpload } = await import("@/lib/import/docx-upload");
    const { docxBufferToImportedReportContent } = await import(
      "@/lib/import/docx-to-sections"
    );
    const buf = await readDocxUpload(file);
    const imported = await docxBufferToImportedReportContent(buf);

    return NextResponse.json({
      deviationNo: imported.header.deviationNo?.trim() ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("too large") || message.includes("Only Word")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not read that Word file. Save as .docx and try again." },
      { status: 400 }
    );
  }
}
