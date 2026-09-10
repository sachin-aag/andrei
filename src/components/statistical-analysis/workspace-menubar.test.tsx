// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WORKSHEET_PLOT_CATALOG } from "@/lib/statistical-analysis/plot-catalog";
import { HISTOGRAM } from "@/lib/statistical-analysis/types";
import { WorkspaceMenubar } from "./workspace-menubar";

describe("WorkspaceMenubar", () => {
  it("lists every worksheet plot from the shared catalog", async () => {
    const user = userEvent.setup();
    const onSelectPlot = vi.fn();
    render(
      <WorkspaceMenubar
        readOnly={false}
        onLoadSample={vi.fn()}
        onSelectPlot={onSelectPlot}
        onAddDataSheet={vi.fn()}
        onRenameDataSheet={vi.fn()}
      />
    );

    await user.click(screen.getByTestId("worksheet-plot-menu"));
    for (const item of WORKSHEET_PLOT_CATALOG) {
      expect(screen.getByTestId(item.menuTestId)).toHaveTextContent(
        `${item.label}…`
      );
    }
    await user.click(screen.getByTestId("stat-histogram"));
    expect(onSelectPlot).toHaveBeenCalledWith(HISTOGRAM);
  });
});
