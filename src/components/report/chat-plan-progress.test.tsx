// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ChatPendingPlan } from "@/lib/ai/chat/pending-plan";
import { ChatPlanProgress } from "./chat-plan-progress";

function plan(items: ChatPendingPlan["items"]): ChatPendingPlan {
  return {
    kind: "section_queue",
    objective: "Draft the remaining sections",
    items,
    createdAt: "2026-09-14T00:00:00.000Z",
    promptVersion: "chat-v94-section-plan",
  };
}

describe("ChatPlanProgress", () => {
  it("shows a live collapsed label that updates when the plan advances", () => {
    const first = plan([
      {
        sectionKey: "elr_media_fill",
        label: "Media Fill / Aseptic Process Simulation",
        state: "in_progress",
      },
      {
        sectionKey: "elr_qualification",
        label: "Qualification",
        state: "queued",
      },
    ]);
    const { rerender } = render(
      <ChatPlanProgress
        plan={first}
        documentType="equipment_lifecycle_report"
      />
    );
    expect(
      screen.getByRole("button", {
        name: "1 of 2 — Media Fill / Aseptic Process Simulation",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("chat-plan-progress-list")
    ).not.toBeInTheDocument();

    rerender(
      <ChatPlanProgress
        plan={plan([
          {
            sectionKey: "elr_media_fill",
            label: "Media Fill / Aseptic Process Simulation",
            state: "done",
          },
          {
            sectionKey: "elr_qualification",
            label: "Qualification",
            state: "in_progress",
          },
        ])}
        documentType="equipment_lifecycle_report"
      />
    );
    expect(
      screen.getByRole("button", { name: "2 of 2 — Qualification" })
    ).toBeInTheDocument();
  });

  it("expands to done, current, and pending sections", async () => {
    const user = userEvent.setup();
    render(
      <ChatPlanProgress
        plan={plan([
          { sectionKey: "elr_objective", label: "Objective", state: "done" },
          {
            sectionKey: "elr_media_fill",
            label: "Media Fill / Aseptic Process Simulation",
            state: "in_progress",
          },
          {
            sectionKey: "elr_qualification",
            label: "Qualification",
            state: "queued",
          },
        ])}
        documentType="equipment_lifecycle_report"
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: "2 of 3 — Media Fill / Aseptic Process Simulation",
      })
    );

    const list = screen.getByTestId("chat-plan-progress-list");
    expect(list).toHaveTextContent("Done");
    expect(list).toHaveTextContent("Objective");
    expect(list).toHaveTextContent("In progress");
    expect(list).toHaveTextContent("Media Fill / Aseptic Process Simulation");
    expect(list).toHaveTextContent("Pending");
    expect(list).toHaveTextContent("Qualification");
  });

  it("shows a paused badge instead of a spinner", () => {
    render(
      <ChatPlanProgress
        plan={{
          kind: "section_queue",
          objective: "Draft the remaining sections",
          items: [
            {
              sectionKey: "elr_media_fill",
              label: "Media Fill / Aseptic Process Simulation",
              state: "queued",
            },
          ],
          createdAt: "2026-09-14T00:00:00.000Z",
          promptVersion: "chat-v94-section-plan",
          paused: true,
        }}
        documentType="equipment_lifecycle_report"
      />
    );
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "1 of 1 — Media Fill / Aseptic Process Simulation",
      })
    ).toBeInTheDocument();
  });
});
