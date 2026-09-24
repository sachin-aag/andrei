// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TemplateGallery } from "@/components/templates/template-gallery";
import { listedDemoTemplatesInSection } from "@/lib/document-templates";

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
  it("opens Supply Chain by default with the vendor qualification tile", () => {
    render(<TemplateGallery managers={managers} />);

    expect(
      screen.getByRole("button", { name: /^Supply Chain$/i })
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /^Vendor Qualification$/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^DFMEA$/i })).not.toBeInTheDocument();
  });

  it("expands Design and shows product-design tiles", async () => {
    const user = userEvent.setup();
    render(<TemplateGallery managers={managers} />);

    await user.click(screen.getByRole("button", { name: /^Design$/i }));

    expect(
      screen.getByRole("button", { name: /^User Requirements$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Design Verification Testing$/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Vendor Qualification$/i })
    ).not.toBeInTheDocument();
  });

  it("lists every operations and quality template when those sections open", async () => {
    const user = userEvent.setup();
    render(<TemplateGallery managers={managers} />);

    await user.click(screen.getByRole("button", { name: /^Operations$/i }));
    for (const template of listedDemoTemplatesInSection("operations")) {
      expect(
        screen.getByRole("button", { name: template.title })
      ).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: /^Quality$/i }));
    expect(screen.getByRole("button", { name: /^CAPA$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Deviations$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Change Control$/i })
    ).toBeInTheDocument();
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
