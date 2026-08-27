// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_UPLOADING_NOTICE,
  DocumentUploadingNotice,
  useDocumentUploadingNotice,
} from "./document-uploading-notice";

const useReportAttachmentsMock = vi.fn();

vi.mock("@/providers/report-attachments-provider", () => ({
  useReportAttachments: () => useReportAttachmentsMock(),
}));

function HookProbe({ input }: { input: string }) {
  const show = useDocumentUploadingNotice(input);
  return show ? <DocumentUploadingNotice /> : null;
}

describe("DocumentUploadingNotice", () => {
  it("renders the small uploading warning", () => {
    render(<DocumentUploadingNotice />);
    expect(screen.getByRole("status")).toHaveTextContent(
      DOCUMENT_UPLOADING_NOTICE
    );
  });
});

describe("useDocumentUploadingNotice", () => {
  it("stays hidden until the user types during an in-flight upload", () => {
    useReportAttachmentsMock.mockReturnValue({
      attachments: [{ processingStatus: "uploading" }],
    });

    const { rerender } = render(<HookProbe input="" />);
    expect(screen.queryByTestId("document-uploading-notice")).not.toBeInTheDocument();

    rerender(<HookProbe input="hello" />);
    expect(screen.getByTestId("document-uploading-notice")).toHaveTextContent(
      DOCUMENT_UPLOADING_NOTICE
    );
  });

  it("keeps the warning after the user clears or sends, until processing finishes", () => {
    useReportAttachmentsMock.mockReturnValue({
      attachments: [{ processingStatus: "processing" }],
    });

    const { rerender } = render(<HookProbe input="ask about this file" />);
    expect(screen.getByTestId("document-uploading-notice")).toBeInTheDocument();

    rerender(<HookProbe input="" />);
    expect(screen.getByTestId("document-uploading-notice")).toBeInTheDocument();
  });

  it("hides the warning once every attachment is ready or failed", () => {
    useReportAttachmentsMock.mockReturnValue({
      attachments: [{ processingStatus: "uploading" }],
    });

    const { rerender } = render(<HookProbe input="hello" />);
    expect(screen.getByTestId("document-uploading-notice")).toBeInTheDocument();

    useReportAttachmentsMock.mockReturnValue({
      attachments: [{ processingStatus: "ready" }],
    });
    rerender(<HookProbe input="hello" />);
    expect(screen.queryByTestId("document-uploading-notice")).not.toBeInTheDocument();
  });
});
