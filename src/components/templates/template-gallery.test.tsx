// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TemplateGallery } from "@/components/templates/template-gallery";
import {
  DEMO_TEMPLATE_SECTIONS,
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
