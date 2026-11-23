// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TemplateGallery } from "@/components/templates/template-gallery";
import {
  DEMO_TEMPLATE_SECTIONS,
  isDemoTemplateExportReady,
  listedDemoTemplatesInSection,
} from "@/lib/document-templates";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const managers = [
  { id: "manager-1", name: "Test Manager", title: "QA Manager" },
];

describe("TemplateGallery", () => {
  it("keeps every section open with its tiles", () => {
    render(<TemplateGallery managers={managers} />);

    for (const section of DEMO_TEMPLATE_SECTIONS) {
      expect(
        screen.getByRole("heading", { name: section.title })
      ).toBeInTheDocument();
      for (const template of listedDemoTemplatesInSection(section.id)) {
        expect(
          screen.getByRole("button", { name: template.title })
        ).toBeInTheDocument();
      }
    }
  });

  it("shows a subtle ready tick on export-ready templates only", () => {
    render(<TemplateGallery managers={managers} />);

    const vendor = screen.getByRole("button", { name: /^Vendor Qualification$/i });
    expect(
      within(vendor).queryByTestId("template-ready-badge")
    ).toBeNull();

    const supplierSop = screen.getByRole("button", {
      name: /^Supplier Control Procedure$/i,
    });
    expect(
      within(supplierSop).getByRole("img", { name: "Complete template" })
    ).toBeInTheDocument();

    const designVerification = screen.getByRole("button", {
      name: /^Design Verification Testing$/i,
    });
    expect(
      within(designVerification).getByRole("img", { name: "Complete template" })
    ).toBeInTheDocument();

    const deviations = screen.getByRole("button", { name: /^Deviations$/i });
    expect(
      within(deviations).getByRole("img", { name: "Complete template" })
    ).toBeInTheDocument();

    for (const section of DEMO_TEMPLATE_SECTIONS) {
      for (const template of listedDemoTemplatesInSection(section.id)) {
        const tile = screen.getByRole("button", { name: template.title });
        if (isDemoTemplateExportReady(template)) {
          expect(
            within(tile).getByRole("img", { name: "Complete template" })
          ).toBeInTheDocument();
        } else {
          expect(
            within(tile).queryByRole("img", { name: "Complete template" })
          ).toBeNull();
        }
      }
    }
  });

  it("opens the create dialog from a tile", async () => {
    const user = userEvent.setup();
    render(<TemplateGallery managers={managers} />);

    await user.click(
      screen.getByRole("button", { name: /^Vendor Qualification$/i })
    );

    expect(
      screen.getByRole("heading", { name: /create vendor qualification/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/document number/i)).toBeInTheDocument();
  });

  it("opens a blank document from the header action", async () => {
    const user = userEvent.setup();
    render(<TemplateGallery managers={managers} />);

    await user.click(screen.getByRole("button", { name: /blank document/i }));

    expect(
      screen.getByRole("heading", { name: /create blank document/i })
    ).toBeInTheDocument();
  });
});
