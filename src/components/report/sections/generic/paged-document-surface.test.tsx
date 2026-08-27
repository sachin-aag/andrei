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

  it("places page labels outside a hairline so they cannot cover the sheet", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return this.classList.contains("ProseMirror") ? 900 : 0;
      },
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        cb: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) {
          this.cb = cb;
        }
        observe() {
          this.cb([], this as unknown as ResizeObserver);
        }
        unobserve() {}
        disconnect() {}
      }
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const height = this.classList.contains("generic-page-metric") ? 400 : 0;
        return {
          x: 0,
          y: 0,
          width: 100,
          height,
          top: 0,
          left: 0,
          bottom: height,
          right: 100,
          toJSON() {
            return {};
          },
        };
      }
    );

    render(
      <PagedDocumentSurface>
        <div className="ProseMirror">Hello</div>
      </PagedDocumentSurface>
    );

    expect(screen.getByTestId("paged-document")).toHaveAttribute(
      "data-page-count",
      "3"
    );
    const separator = screen.getByRole("separator", { name: /page 1 of 3/i });
    expect(separator).toHaveClass("pointer-events-none");
    expect(separator).toHaveClass("generic-page-separator");
    expect(separator.querySelector(".generic-page-separator-label")).toHaveTextContent(
      "Page 1"
    );
  });
});
