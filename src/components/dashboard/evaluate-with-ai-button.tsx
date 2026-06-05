"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImproveAiStaleRerunDialog } from "@/components/improve-ai/improve-ai-stale-rerun-dialog";
import { startImproveAiFromReport } from "@/lib/improve-ai/client";
import { cn } from "@/lib/utils";

export function EvaluateWithAiButton({
  reportId,
  deviationNo,
  layout = "stacked",
}: {
  reportId: string;
  deviationNo: string;
  layout?: "inline" | "stacked";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showError = (message: string) => {
    if (layout === "inline") {
      toast.error(message);
    } else {
      setError(message);
    }
  };

  const navigateToSession = (sessionId: string) => {
    router.push(`/improve-ai/${encodeURIComponent(sessionId)}`);
  };

  const handleStart = async (confirmRerun: boolean) => {
    const result = await startImproveAiFromReport(reportId, { confirmRerun });
    if (!result.ok) {
      showError(result.error);
      return false;
    }
    if (result.needsConfirmation) {
      setConfirmOpen(true);
      return false;
    }
    navigateToSession(result.sessionId);
    return true;
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    setError(null);

    try {
      await handleStart(false);
    } catch {
      showError("Could not start evaluation");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRerun = async () => {
    setConfirming(true);
    setError(null);
    try {
      const navigated = await handleStart(true);
      if (navigated) {
        setConfirmOpen(false);
      }
    } catch {
      showError("Could not start evaluation");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          layout === "inline" ? "shrink-0" : "flex flex-col items-end gap-1"
        )}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(layout === "inline" && "h-7 px-2.5 text-xs")}
          disabled={loading || confirming}
          onClick={handleClick}
          title={`Evaluate ${deviationNo} with AI`}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Improve AI
        </Button>
        {layout === "stacked" && error ? (
          <span className="text-[10px] text-red-600 max-w-[140px] text-right">
            {error}
          </span>
        ) : null}
      </div>
      <ImproveAiStaleRerunDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!confirming) setConfirmOpen(next);
        }}
        pending={confirming}
        onConfirm={handleConfirmRerun}
      />
    </>
  );
}
