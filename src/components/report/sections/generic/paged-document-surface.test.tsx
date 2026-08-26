// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PagedDocumentSurface } from "@/components/report/sections/generic/paged-document-surface";

beforeAll(() => {
  if (typeof ResizeObserver === "undefined") {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  }
  if (typeof MutationObserver === "undefined") {
    vi.stubGlobal(
      "MutationObserver",
      class {
        observe() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      }
    );
  }
});

describe("PagedDocumentSurface", () => {
  it("keeps a single canvas for the TipTap field", () => {
    render(
      <PagedDocumentSurface>
        <div className="ProseMirror">Hello</div>
      </PagedDocumentSurface>
    );

    expect(screen.getByTestId("paged-document")).toBeInTheDocument();
    expect(screen.getByTestId("paged-document")).toHaveAttribute(
      "data-page-count",
      "1"
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
