// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminLimitsPanel } from "./admin-limits-panel";
import type { AiBudgetStatus } from "@/lib/ai/usage";
import type { AttachmentPageBudgetStatus } from "@/lib/attachments/page-budget";
import type { AttachmentStorageBudgetStatus } from "@/lib/attachments/storage-budget";
import type { VoiceBudgetStatus } from "@/lib/voice/budget";

const aiBudget: AiBudgetStatus = {
  monthlyBudgetUsd: 500,
  enforceHardLimit: true,
  warningThresholdPercent: 80,
  currentMonthSpendUsd: 12.5,
  percentUsed: 2.5,
  isWarning: false,
  isOverBudget: false,
  yearMonth: "2026-08",
  cycleStart: "2026-08-01T00:00:00.000Z",
  cycleEnd: "2026-09-01T00:00:00.000Z",
  featureBreakdown: [
    {
      feature: "voice_transcribe",
      spendUsd: 1.2,
      inputTokens: 40_000,
      outputTokens: 200,
      eventCount: 4,
    },
  ],
};

const attachmentBudget: AttachmentPageBudgetStatus = {
  monthlyPageLimit: 100_000,
  enforceHardLimit: true,
  warningThresholdPercent: 80,
  currentMonthPageCount: 250,
  inFlightPageCount: 0,
  totalCommittedPageCount: 250,
  percentUsed: 0.3,
  isWarning: false,
  isOverBudget: false,
  yearMonth: "2026-08",
  cycleStart: "2026-08-01T00:00:00.000Z",
  cycleEnd: "2026-09-01T00:00:00.000Z",
  eventCount: 3,
};

const storageBudget: AttachmentStorageBudgetStatus = {
  byteLimit: 107_374_182_400,
  limitGb: 100,
  enforceHardLimit: true,
  warningThresholdPercent: 80,
  usedBytes: 2.5 * 1024 * 1024 * 1024,
  usedGb: 2.5,
  percentUsed: 2.5,
  isWarning: false,
  isOverBudget: false,
};

const voiceBudget: VoiceBudgetStatus = {
  monthlyMinuteLimit: 100_000,
  enforceHardLimit: true,
  warningThresholdPercent: 80,
  currentMonthAudioSeconds: 180,
  currentMonthMinutes: 3,
  percentUsed: 0,
  isWarning: false,
  isOverBudget: false,
  yearMonth: "2026-08",
  cycleStart: "2026-08-01T00:00:00.000Z",
  cycleEnd: "2026-09-01T00:00:00.000Z",
  eventCount: 6,
};

describe("AdminLimitsPanel", () => {
  it("shows AI, attachment storage, page, and voice transcription budgets together", () => {
    render(
      <AdminLimitsPanel
        initialAiBudgetStatus={aiBudget}
        initialAttachmentPageBudgetStatus={attachmentBudget}
        initialAttachmentStorageBudgetStatus={storageBudget}
        initialVoiceBudgetStatus={voiceBudget}
      />
    );

    expect(screen.getByRole("heading", { name: "Limits" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI monthly budget" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Attachment storage" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Attachment page budget" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Voice transcription budget" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Limit (GB)")).toHaveValue(100);
    expect(screen.getByText(/2.5 of 100 GB/)).toBeInTheDocument();
    expect(screen.getByLabelText("Monthly limit (minutes)")).toHaveValue(100_000);
    expect(screen.getByText(/3 of 100,000 minutes/)).toBeInTheDocument();
    expect(screen.getByText("Voice Transcribe")).toBeInTheDocument();
  });
});
