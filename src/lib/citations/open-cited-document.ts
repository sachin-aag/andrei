import { toast } from "sonner";
import { resolveCitedAttachment } from "@/lib/citations/resolve-cited-attachment";
import { parseSourceCitation } from "@/lib/placeholders/citation-bracket";

export type CitedAttachmentRef = {
  id: string;
  filename: string;
};

export type OpenCitedDocumentResult =
  | { status: "opened"; attachmentId: string; page: number }
  | { status: "missing" }
  | { status: "ambiguous" }
  | { status: "unresolved" };

export function openCitedDocument(args: {
  raw: string;
  attachments: readonly CitedAttachmentRef[];
  openDocument: (id: string, page?: number) => void;
}): OpenCitedDocumentResult {
  const parsed = parseSourceCitation(args.raw);
  if (!parsed) return { status: "unresolved" };

  const resolved = resolveCitedAttachment(args.attachments, parsed.filename);
  switch (resolved.status) {
    case "found": {
      const page = parsed.pages[0] ?? 1;
      args.openDocument(resolved.attachment.id, page);
      return {
        status: "opened",
        attachmentId: resolved.attachment.id,
        page,
      };
    }
    case "missing":
      return { status: "missing" };
    case "ambiguous":
      return { status: "ambiguous" };
    default: {
      const _exhaustive: never = resolved;
      return _exhaustive;
    }
  }
}

export function openCitedDocumentOrToast(args: {
  raw: string;
  attachments: readonly CitedAttachmentRef[];
  openDocument: (id: string, page?: number) => void;
}): boolean {
  const result = openCitedDocument(args);
  switch (result.status) {
    case "opened":
      return true;
    case "missing":
      toast.error("That file isn't attached to this report.");
      return false;
    case "ambiguous":
      toast.error(
        "Several files match that citation — open it from Documents."
      );
      return false;
    case "unresolved":
      toast.error("Couldn't find the source for that citation.");
      return false;
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}
