"use client";

import { AdminAiBudgetPanel } from "@/components/admin/admin-ai-budget-panel";
import { AdminAttachmentPageBudgetPanel } from "@/components/admin/admin-attachment-page-budget-panel";
import { AdminVoiceBudgetPanel } from "@/components/admin/admin-voice-budget-panel";
import type { AiBudgetStatus } from "@/lib/ai/usage";
import type { AttachmentPageBudgetStatus } from "@/lib/attachments/page-budget";
import type { VoiceBudgetStatus } from "@/lib/voice/budget";

export function AdminLimitsPanel({
  initialAiBudgetStatus,
  initialAttachmentPageBudgetStatus,
  initialVoiceBudgetStatus,
}: {
  initialAiBudgetStatus: AiBudgetStatus;
  initialAttachmentPageBudgetStatus: AttachmentPageBudgetStatus;
  initialVoiceBudgetStatus: VoiceBudgetStatus;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border)] px-10 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Limits</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Monthly caps for Gemini AI spend, attachment page processing, and
          voice transcription. All reset on the first day of each month (UTC).
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-10 py-6">
        <div className="grid max-w-4xl gap-4">
          <AdminAiBudgetPanel initialStatus={initialAiBudgetStatus} />
          <AdminAttachmentPageBudgetPanel
            initialStatus={initialAttachmentPageBudgetStatus}
          />
          <AdminVoiceBudgetPanel initialStatus={initialVoiceBudgetStatus} />
        </div>
      </div>
    </div>
  );
}
