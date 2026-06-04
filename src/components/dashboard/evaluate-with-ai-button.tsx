"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EvaluateWithAiButton({
  reportId,
  deviationNo,
}: {
  reportId: string;
  deviationNo: string;
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
        setError(data.error ?? "Could not start evaluation");
        return;
      }
      router.push(`/improve-ai/${encodeURIComponent(data.sessionId)}`);
    } catch {
      setError("Could not start evaluation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={handleClick}
        title={`Evaluate ${deviationNo} with AI`}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4" />
        )}
        Improve AI
      </Button>
      {error ? (
        <span className="text-[10px] text-red-600 max-w-[140px] text-right">
          {error}
        </span>
      ) : null}
    </div>
  );
}
