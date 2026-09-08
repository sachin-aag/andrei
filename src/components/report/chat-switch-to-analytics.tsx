"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";

/**
 * Tiny recovery control when Report chat is sure the engineer asked to
 * fill the Analytics worksheet. Hidden unless the intent classifier agreed.
 * Stays mounted after the click so the confirmation is not unmounted when
 * the composer target flips to Analytics.
 */
export function SwitchToAnalyticsCard({
  onSwitch,
  composerOnAnalytics = false,
}: {
  onSwitch: () => void;
  composerOnAnalytics?: boolean;
}) {
  const [switched, setSwitched] = useState(false);

  if (composerOnAnalytics && !switched) {
    return null;
  }

  const activate = () => {
    if (switched) return;
    setSwitched(true);
    onSwitch();
  };

  return (
    <div
      className="rounded-md border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-3 py-2.5 text-[12px]"
      data-testid="chat-switch-to-analytics"
    >
      <div className="flex items-start gap-2">
        <BarChart3
          className="mt-0.5 size-3.5 shrink-0 text-[var(--primary)]"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="leading-snug text-[var(--foreground)]">
            That belongs on the Analytics worksheet, not this report.
          </p>
          {switched ? (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Switched to Analytics. Sending your request.
            </p>
          ) : (
            <button
              type="button"
              onClick={activate}
              className="rounded-md bg-[var(--primary)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
            >
              Switch to Analytics
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
