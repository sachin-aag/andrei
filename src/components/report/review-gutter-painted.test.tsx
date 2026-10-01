// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ReviewGutterPaintedProvider,
  useReviewGutterColumnPainted,
} from "./review-gutter-painted";

function Probe() {
  const painted = useReviewGutterColumnPainted();
  return <span>{painted ? "painted" : "hidden"}</span>;
}

describe("useReviewGutterColumnPainted", () => {
  it("defaults to hidden so the in-document card stays without a provider", () => {
    render(<Probe />);
    expect(screen.getByText("hidden")).toBeInTheDocument();
  });

  it("reads the painted flag from the report canvas provider", () => {
    render(
      <ReviewGutterPaintedProvider painted>
        <Probe />
      </ReviewGutterPaintedProvider>
    );
    expect(screen.getByText("painted")).toBeInTheDocument();
  });
});
