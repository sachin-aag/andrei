"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  const [error, setError] = useState<string | null>(null);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/improve-ai/from-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      const data = (await res.json()) as {
        sessionId?: string;
        error?: string;
      };
      if (!res.ok || !data.sessionId) {
        const message = data.error ?? "Could not start evaluation";
        if (layout === "inline") {
          toast.error(message);
        } else {
          setError(message);
        }
        return;
      }
      router.push(`/improve-ai/${encodeURIComponent(data.sessionId)}`);
    } catch {
      const message = "Could not start evaluation";
      if (layout === "inline") {
        toast.error(message);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
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
        disabled={loading}
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
  );
}
