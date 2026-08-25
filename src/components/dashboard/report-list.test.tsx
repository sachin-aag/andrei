// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportList } from "@/components/dashboard/report-list";
import type { ReportCardData } from "@/components/report/report-card";
import {
  CONVERGENT_PACK,
  DEMO_PACK,
  getCustomerPack,
} from "@/lib/customers/packs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/customers/packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers/packs")>();
  return {
    ...actual,
    getCustomerPack: vi.fn(() => actual.DEMO_PACK),
  };
});

const usersById = {
  "eng-1": { name: "Engineer" },
};

function report(
  overrides: Partial<ReportCardData> & Pick<ReportCardData, "id" | "documentType">
): ReportCardData {
  return {
    documentNo: "DOC-1",
    date: new Date("2026-01-01"),
    status: "draft",
    authorId: "eng-1",
    assignedManagerId: null,
    assignedManagerIds: [],
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("ReportList type filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCustomerPack).mockReturnValue(DEMO_PACK);
  });

  it("labels demo filters Investigation and Design Verification", () => {
    render(
      <ReportList
        reports={[
          report({ id: "ir-1", documentType: "investigation_report" }),
          report({ id: "dv-1", documentType: "design_verification" }),
        ]}
        currentUserId="eng-1"
        userRole="engineer"
        usersById={usersById}
      />
    );

    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^investigation$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^design verification$/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^mechanical dv$/i })
    ).not.toBeInTheDocument();
  });

  it("does not offer Investigation on Convergent — Mechanical DV instead", () => {
    vi.mocked(getCustomerPack).mockReturnValue(CONVERGENT_PACK);
    render(
      <ReportList
        reports={[
          report({
            id: "mdv-1",
            documentType: "mechanical_design_verification",
            documentNo: "dvr abcde",
          }),
          report({ id: "dv-1", documentType: "design_verification" }),
        ]}
        currentUserId="eng-1"
        userRole="engineer"
        usersById={usersById}
      />
    );

    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^design verification$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^mechanical dv$/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^investigation$/i })
    ).not.toBeInTheDocument();
  });

  it("does not mention investigation in the Convergent empty state", () => {
    vi.mocked(getCustomerPack).mockReturnValue(CONVERGENT_PACK);
    render(
      <ReportList
        reports={[]}
        currentUserId="eng-1"
        userRole="engineer"
        usersById={usersById}
      />
    );

    expect(screen.getByText(/no reports yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/create your first report/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/investigation/i)).not.toBeInTheDocument();
  });
});
