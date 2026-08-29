import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AnalysisRecomputeButton({
  onClick,
  disabled = false,
  recomputing = false,
}: {
  onClick: () => void;
  disabled?: boolean;
  recomputing?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-8 shrink-0"
      data-testid="recompute-analysis"
      aria-label={recomputing ? "Recomputing…" : "Recompute with current data"}
      disabled={disabled || recomputing}
      onClick={onClick}
    >
      <RefreshCw
        className={`size-4 ${recomputing ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
    </Button>
  );
}
