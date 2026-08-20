import { GoogleAuth } from "google-auth-library";
import { getWifAccessToken, getWifConfig } from "@/lib/gcp/wif-token";
import {
  splitPdfByPageCount,
  uprightRotatePdfPages,
} from "@/lib/attachments/pdf-split";

export const DOCUMENT_AI_ONLINE_PAGE_LIMIT = 15;
export const DOCUMENT_AI_IMAGELESS_PAGE_LIMIT = 30;
export const DOCUMENT_AI_OCR_CONCURRENCY = 3;
/** 15-page slices × 3 in flight — the Enterprise OCR ingest wave. */
export const DOCUMENT_AI_PAGES_IN_FLIGHT =
  DOCUMENT_AI_ONLINE_PAGE_LIMIT * DOCUMENT_AI_OCR_CONCURRENCY;
export const DOCUMENT_AI_MAX_ONLINE_BYTES = 40 * 1024 * 1024;

export function documentAiIngestSplitOptions(): {
  preferredPagesPerBatch: number;
  maxPagesPerBatch: number;
  maxBatchBytes: number;
} {
  return {
    preferredPagesPerBatch: DOCUMENT_AI_ONLINE_PAGE_LIMIT,
    maxPagesPerBatch: DOCUMENT_AI_ONLINE_PAGE_LIMIT,
    maxBatchBytes: DOCUMENT_AI_MAX_ONLINE_BYTES,
  };
}

export type DocumentAiOcrAttempt = {
  id: string;
  chunkPages: number;
  imagelessMode: boolean;
  languageHint: string | null;
  preRotate: boolean;
};

/** Allowed compare iterations from the bake-off plan (max 3). */
export const DOCUMENT_AI_COMPARE_ATTEMPTS: DocumentAiOcrAttempt[] = [
  {
    id: "chunk-15",
    chunkPages: DOCUMENT_AI_ONLINE_PAGE_LIMIT,
    imagelessMode: false,
    languageHint: null,
    preRotate: false,
  },
  {
    id: "chunk-15-prerotate",
    chunkPages: DOCUMENT_AI_ONLINE_PAGE_LIMIT,
    imagelessMode: false,
    languageHint: null,
    preRotate: true,
  },
  {
    id: "chunk-5-en",
    chunkPages: 5,
    imagelessMode: false,
    languageHint: "en",
    preRotate: true,
  },
];

export type DocumentAiOcrPage = {
  pageNumber: number;
  transcript: string;
  confidence: number | null;
};

export type DocumentAiChunkTiming = {
  pageStart: number;
  pageEnd: number;
  elapsedMs: number;
  pageCount: number;
};

export type DocumentAiOcrResult = {
  pages: DocumentAiOcrPage[];
  elapsedMs: number;
  chunks: DocumentAiChunkTiming[];
};

type TextSegment = {
  startIndex?: string | number;
  endIndex?: string | number;
};

type TextAnchor = {
  textSegments?: TextSegment[];
};

type Layout = {
  textAnchor?: TextAnchor;
  confidence?: number;
};

type DocumentAiPage = {
  pageNumber?: number;
  layout?: Layout;
};

export type DocumentAiDocument = {
  text?: string;
  pages?: DocumentAiPage[];
};

type ProcessDocumentResponse = {
  document?: DocumentAiDocument;
  error?: { message?: string };
};

export function isDocumentAiConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_VERTEX_PROJECT?.trim() &&
      process.env.DOCUMENT_AI_PROCESSOR_ID?.trim() &&
      process.env.DOCUMENT_AI_LOCATION?.trim()
  );
}

export function resolveDocumentAiProcessorName(): string {
  const project = process.env.GOOGLE_VERTEX_PROJECT?.trim();
  const location = process.env.DOCUMENT_AI_LOCATION?.trim();
  const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID?.trim();
  if (!project || !location || !processorId) {
    throw new Error(
      "Document AI OCR needs GOOGLE_VERTEX_PROJECT, DOCUMENT_AI_LOCATION, and DOCUMENT_AI_PROCESSOR_ID."
    );
  }
  if (processorId.startsWith("projects/")) return processorId;
  return `projects/${project}/locations/${location}/processors/${processorId}`;
}

export function textFromAnchor(
  fullText: string,
  textAnchor: TextAnchor | undefined
): string {
  if (!textAnchor?.textSegments?.length) return "";
  return textAnchor.textSegments
    .map((segment) => {
      const start = Number(segment.startIndex ?? 0);
      const end = Number(segment.endIndex ?? 0);
      return fullText.slice(start, end);
    })
    .join("")
    .trim();
}

export function mapDocumentAiPages(
  document: DocumentAiDocument,
  pageStart: number
): DocumentAiOcrPage[] {
  const fullText = document.text ?? "";
  const pages = document.pages ?? [];
  if (pages.length === 0 && fullText.length > 0) {
    return [
      {
        pageNumber: pageStart,
        transcript: fullText.trim(),
        confidence: null,
      },
    ];
  }

  return pages.map((page, index) => {
    const relative =
      typeof page.pageNumber === "number" && page.pageNumber >= 1
        ? page.pageNumber
        : index + 1;
    return {
      pageNumber: pageStart + relative - 1,
      transcript: textFromAnchor(fullText, page.layout?.textAnchor) || "",
      confidence:
        typeof page.layout?.confidence === "number"
          ? page.layout.confidence
          : null,
    };
  });
}

export async function ocrPdfWithDocumentAi(input: {
  pdfBuffer: Buffer;
  filename?: string;
  attempt?: DocumentAiOcrAttempt;
}): Promise<DocumentAiOcrResult> {
  const attempt = input.attempt ?? DOCUMENT_AI_COMPARE_ATTEMPTS[0]!;
  const chunks = await splitPdfByPageCount(input.pdfBuffer, attempt.chunkPages);
  const started = Date.now();
  const timings: DocumentAiChunkTiming[] = [];
  const pages: DocumentAiOcrPage[] = [];

  const concurrency = DOCUMENT_AI_OCR_CONCURRENCY;
  for (let index = 0; index < chunks.length; index += concurrency) {
    const slice = chunks.slice(index, index + concurrency);
    const results = await Promise.all(
      slice.map(async (chunk) => {
        const chunkStarted = Date.now();
        const payload = attempt.preRotate
          ? (await uprightRotatePdfPages(chunk.buffer)).buffer
          : chunk.buffer;
        const document = await processDocumentAiPdf(payload, attempt);
        const mapped = mapDocumentAiPages(document, chunk.pageStart);
        return {
          mapped,
          timing: {
            pageStart: chunk.pageStart,
            pageEnd: chunk.pageEnd,
            elapsedMs: Date.now() - chunkStarted,
            pageCount: mapped.length,
          } satisfies DocumentAiChunkTiming,
        };
      })
    );
    for (const result of results) {
      pages.push(...result.mapped);
      timings.push(result.timing);
    }
  }

  pages.sort((left, right) => left.pageNumber - right.pageNumber);
  return {
    pages,
    elapsedMs: Date.now() - started,
    chunks: timings,
  };
}

async function processDocumentAiPdf(
  pdfBuffer: Buffer,
  attempt: DocumentAiOcrAttempt
): Promise<DocumentAiDocument> {
  const processorName = resolveDocumentAiProcessorName();
  const location = processorName.split("/")[3];
  if (!location) {
    throw new Error(`Could not parse Document AI location from ${processorName}`);
  }
  const token = await getDocumentAiAccessToken();
  const ocrConfig: Record<string, unknown> = {
    enableNativePdfParsing: true,
  };
  if (attempt.languageHint) {
    ocrConfig.hints = { languageHints: [attempt.languageHint] };
  }

  const body: Record<string, unknown> = {
    skipHumanReview: true,
    rawDocument: {
      content: pdfBuffer.toString("base64"),
      mimeType: "application/pdf",
    },
    processOptions: { ocrConfig },
    fieldMask: "text,pages",
  };
  if (attempt.imagelessMode) {
    body.imagelessMode = true;
  }

  const url = `https://${location}-documentai.googleapis.com/v1/${processorName}:process`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ProcessDocumentResponse;
  if (!response.ok) {
    throw new Error(
      `Document AI process failed: ${response.status} ${payload.error?.message ?? JSON.stringify(payload)}`
    );
  }
  if (!payload.document) {
    throw new Error("Document AI returned no document");
  }
  return payload.document;
}

async function getDocumentAiAccessToken(): Promise<string> {
  const wif = getWifConfig();
  if (wif) return getWifAccessToken(wif);

  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error(
      "No Google access token for Document AI. Run `gcloud auth application-default login` or set WIF."
    );
  }
  return token.token;
}
