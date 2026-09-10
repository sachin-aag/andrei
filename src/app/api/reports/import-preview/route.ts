import { NextResponse, after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import type { DocumentType } from "@/db/schema";
import { documentTypeEnum } from "@/db/schema";
import {
  getDocumentType,
  isWordImportAvailable,
  wordImportFor,
} from "@/lib/document-types";
import { readDocxUpload } from "@/lib/import/docx-upload";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";
import {
  docxBufferToGenericDocument,
  GenericDocxImportError,
} from "@/lib/import/docx-to-generic-document";
import {
  flushLangfuseTraces,
  observeWork,
  setRouteObservationIO,
  withPropagatedAttributes,
} from "@/lib/observability/langfuse";

export const runtime = "nodejs";
export const maxDuration = 60;

const DOCUMENT_TYPE_VALUES = documentTypeEnum.enumValues;

function documentTypeFromForm(value: FormDataEntryValue | null): DocumentType {
  if (
    typeof value === "string" &&
    (DOCUMENT_TYPE_VALUES as readonly string[]).includes(value)
  ) {
    return value as DocumentType;
  }
  return "investigation_report";
}

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
    const documentType = documentTypeFromForm(form.get("documentType"));
    if (!isWordImportAvailable(documentType)) {
      return NextResponse.json(
        { error: "Word import is not enabled for this workspace." },
        { status: 404 }
      );
    }

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "A .docx file is required" }, { status: 400 });
    }

    const buf = await readDocxUpload(file);
    const kind = wordImportFor(getDocumentType(documentType)).kind;
    after(flushLangfuseTraces);
    switch (kind) {
      case "investigation": {
        const imported = await withPropagatedAttributes(
          {
            userId: user.id,
            traceName: "word-import-preview",
            tags: ["word-import", documentType],
            metadata: { documentType, filename: file.name },
          },
          () =>
            observeWork("word-import-preview", async () => {
              setRouteObservationIO({
                input: { documentType, filename: file.name },
              });
              return docxBufferToImportedReportContent(buf);
            })
        );
        const deviationNo = imported.header.deviationNo?.trim() ?? null;
        return NextResponse.json({
          deviationNo,
          documentNo: deviationNo,
        });
      }
      case "generic_body": {
        await withPropagatedAttributes(
          {
            userId: user.id,
            traceName: "word-import-preview",
            tags: ["word-import", documentType],
            metadata: { documentType, filename: file.name },
          },
          () =>
            observeWork("word-import-preview", async () => {
              setRouteObservationIO({
                input: { documentType, filename: file.name },
              });
              return docxBufferToGenericDocument(buf);
            })
        );
        return NextResponse.json({
          deviationNo: null,
          documentNo: null,
        });
      }
      case "none":
        return NextResponse.json(
          { error: "Word import is not enabled for this workspace." },
          { status: 404 }
        );
      default: {
        const exhaustive: never = kind;
        return exhaustive;
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (e instanceof GenericDocxImportError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (message.includes("too large") || message.includes("Only Word")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not read that Word file. Save as .docx and try again." },
      { status: 400 }
    );
  }
}
