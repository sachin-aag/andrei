import Link from "next/link";
import { ArrowRight, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ReviewPrototypeCard() {
  return (
    <Card
      className="border-[var(--brand-200)] bg-[var(--brand-50)] p-5"
      data-testid="review-prototype-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Link
            href="/review-mockup"
            transitionTypes={["nav-forward"]}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-700)]"
          >
            <ScanSearch className="size-5 text-[var(--brand-200)]" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Link href="/review-mockup" transitionTypes={["nav-forward"]}>
                <h3 className="font-semibold">DVP-0142 · AX-7 irrigation protocol</h3>
              </Link>
              <Badge variant="default">In Review</Badge>
              <Badge variant="outline">Prototype</Badge>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              Sample review mode for a created design-verification protocol — agents,
              playbooks, skills, and a live DI/RC trace. Findings are mock data.
            </p>
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0 gap-1.5 shadow-sm">
          <Link href="/review-mockup" transitionTypes={["nav-forward"]}>
            Open review
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
