// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ReportCard } from "@/components/report/report-card";

vi.mock("next/link", () => ({
  default: function MockLink({
    children,
    href,
    prefetch,
    ...rest
  }: {
    children: ReactNode;
    href: string;
    prefetch?: boolean;
  }) {
    return (
      <a href={href} data-prefetch={prefetch === false ? "false" : "true"} {...rest}>
        {children}
      </a>
    );
  },
}));

describe("ReportCard", () => {
  it("does not prefetch the report workspace", () => {
    render(
      <ReportCard
        report={{
          id: "elr-1",
          documentNo: "ELR-1",
          documentType: "equipment_lifecycle_report",
          date: new Date("2026-01-01"),
          status: "draft",
          authorId: "eng-1",
          assignedManagerId: null,
          updatedAt: new Date("2026-01-01"),
        }}
        href="/reports/elr-1/edit"
        authorName="Engineer"
        managerNames={[]}
      />
    );

    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/reports/elr-1/edit");
      expect(link).toHaveAttribute("data-prefetch", "false");
    }
  });
});
