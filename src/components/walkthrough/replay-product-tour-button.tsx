"use client";

import { Button } from "@/components/ui/button";
import { useProductWalkthrough } from "@/components/walkthrough/product-walkthrough";

export function ReplayProductTourButton() {
  const { restart } = useProductWalkthrough();

  return (
    <div className="mt-5">
      <Button type="button" variant="outline" onClick={restart}>
        Replay product tour
      </Button>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        Walks through the features for your role. You can skip and resume on
        the next sign-in, or dismiss it permanently from the tour itself.
      </p>
    </div>
  );
}
