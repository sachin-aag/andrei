// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateReportButton } from "@/components/dashboard/create-report-button";

const prefetch = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
    prefetch,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { toast } from "sonner";
import {
  CONVERGENT_PACK,
  DEMO_PACK,
  getCustomerPack,
  MJ_PACK,
} from "@/lib/customers/packs";

vi.mock("@/lib/customers/packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers/packs")>();
  return {
    ...actual,
    getCustomerPack: vi.fn(() => actual.DEMO_PACK),
  };
});

const managers = [
  { id: "manager-1", name: "Test Manager", title: "QA Manager" },
];

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  };
}

function mockFetchApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST" && url.endsWith("/api/reports")) {
      const raw = init?.body;
      if (typeof raw === "string") {
        const body = JSON.parse(raw) as { preload?: boolean };
        if (body.preload) {
          return jsonResponse({ id: "preload-1", preloaded: true });
        }
      }
      return jsonResponse({ id: "report-1" });
    }
    if (method === "PATCH") {
      return jsonResponse({ report: { id: "preload-1" } });
    }
    if (method === "DELETE") {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CreateReportButton", () => {
  let fetchMock: ReturnType<typeof mockFetchApi>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.mocked(getCustomerPack).mockReturnValue(DEMO_PACK);
    fetchMock = mockFetchApi();
  });

  it("opens the create dialog", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));

    expect(
      screen.getByRole("heading", { name: /create investigation report/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/deviation number/i)).toBeInTheDocument();
  });

  it("preloads a blank draft when the dialog opens", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            documentType: "investigation_report",
            preload: true,
          }),
        })
      );
    });
    await waitFor(() => {
      expect(prefetch).toHaveBeenCalledWith("/reports/preload-1/edit");
    });
  });

  it("discards the preload when the document type changes", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));
    await waitFor(() => {
      expect(prefetch).toHaveBeenCalledWith("/reports/preload-1/edit");
    });

    await user.selectOptions(
      screen.getByLabelText(/document type/i),
      "generic_document"
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/preload-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            documentType: "generic_document",
            preload: true,
          }),
        })
      );
    });
  });

  it("finalizes the preloaded draft on create", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));
    await waitFor(() => {
      expect(prefetch).toHaveBeenCalledWith("/reports/preload-1/edit");
    });
    await user.type(screen.getByLabelText(/deviation number/i), "DEV-1");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/preload-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            documentNo: "DEV-1",
            assignedManagerIds: [],
          }),
        })
      );
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Report created");
    });
    expect(push).toHaveBeenCalledWith("/reports/preload-1/edit");
  });

  it("discards the preload when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));
    await waitFor(() => {
      expect(prefetch).toHaveBeenCalledWith("/reports/preload-1/edit");
    });
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/reports/preload-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
    expect(
      screen.queryByRole("heading", { name: /create investigation report/i })
    ).not.toBeInTheDocument();
  });

  it("shows toast when deviation number is empty", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(toast.error).toHaveBeenCalledWith("Deviation Number is required");
  });

  it("closes the dialog on cancel", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(
      screen.queryByRole("heading", { name: /create investigation report/i })
    ).not.toBeInTheDocument();
  });

  it("does not show a Word-body field or attachment dropzone on demo", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));

    expect(
      screen.queryByLabelText(/existing report/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/documents \(optional\)/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/drop pdfs or word docs/i)
    ).not.toBeInTheDocument();
  });

  it("shows a Word upload field when Document is selected on demo", async () => {
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));
    await user.selectOptions(
      screen.getByLabelText(/document type/i),
      "generic_document"
    );

    expect(
      screen.getByRole("heading", { name: /create document/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/document number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/existing document/i)).toBeInTheDocument();
  });

  it("shows a Word-body field without an attachment dropzone when the MJ pack is active", async () => {
    vi.mocked(getCustomerPack).mockReturnValue(MJ_PACK);
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));

    expect(screen.getByLabelText(/existing report/i)).toBeInTheDocument();
    expect(screen.queryByText(/documents \(optional\)/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/drop pdfs or word docs/i)
    ).not.toBeInTheDocument();
  });

  it("offers software and mechanical DV on Convergent, not investigation", async () => {
    vi.mocked(getCustomerPack).mockReturnValue(CONVERGENT_PACK);
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));

    const typeSelect = screen.getByLabelText(/document type/i);
    expect(typeSelect).toHaveValue("design_verification");
    expect(
      screen.getByRole("option", { name: /design verification report/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /mechanical dv report/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /investigation/i })
    ).not.toBeInTheDocument();
  });

  it("toasts when creating a report fails to reach the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Failed to fetch"))
    );
    const user = userEvent.setup();
    render(<CreateReportButton managers={managers} />);

    await user.click(screen.getByRole("button", { name: /new report/i }));
    await user.type(screen.getByLabelText(/deviation number/i), "DEV-1");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to create report");
    });
    expect(
      screen.getByRole("heading", { name: /create investigation report/i })
    ).toBeInTheDocument();
  });
});
