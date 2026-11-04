"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronLeft,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { REVIEW_MOCKUP_DOCUMENT } from "@/lib/review-mockup/sample-data";
import { ReviewMockupProvider, useReviewMockup } from "./review-mockup-state";
import { ReviewMockupDocument } from "./review-mockup-document";
import { ReviewMockupRail } from "./review-mockup-rail";

function oppositeChrome(chrome: "document" | "agent"): "document" | "agent" {
  return chrome === "document" ? "agent" : "document";
}

function ReviewMockupHeader() {
  const { chrome, setChrome } = useReviewMockup();
  const next = oppositeChrome(chrome);

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[var(--card)] px-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/" transitionTypes={["nav-back"]}>
          <ChevronLeft className="size-4" />
          Reports
        </Link>
      </Button>
      <Separator orientation="vertical" className="h-6" />
      <div className="flex min-w-0 flex-col leading-tight">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold">
            {REVIEW_MOCKUP_DOCUMENT.documentNo}
          </span>
          <Badge variant="default">In Review</Badge>
          <Badge variant="outline">Prototype</Badge>
        </div>
        <span className="truncate text-xs text-[var(--muted-foreground)]">
          {REVIEW_MOCKUP_DOCUMENT.author} → Quality · Rev{" "}
          {REVIEW_MOCKUP_DOCUMENT.revision}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        data-testid="review-mockup-chrome-switch"
        onClick={() => setChrome(next)}
      >
        <ArrowLeftRight className="size-3.5" aria-hidden="true" />
        Switch to {next === "agent" ? "Agent" : "Document"}
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            toast.message("Return with feedback is not wired in this prototype")
          }
        >
          <MessageSquare className="size-4" />
          Return with feedback
        </Button>
        <Button
          type="button"
          variant="success"
          size="sm"
          onClick={() =>
            toast.message("Approve is not wired in this prototype")
          }
        >
          <CheckCircle2 className="size-4" />
          Approve
        </Button>
      </div>
    </header>
  );
}

function ReviewMockupBody() {
  const { chrome } = useReviewMockup();
  const documentColumn = (
    <div
      className="min-h-0 flex-1 overflow-y-auto bg-[var(--background)] px-6 py-6"
      data-testid="review-mockup-canvas"
    >
      <ReviewMockupDocument />
    </div>
  );
  const rail = (
    <div
      className={cn(
        "flex min-h-0 shrink-0",
        chrome === "agent" ? "w-[min(52%,560px)]" : "w-[400px]"
      )}
    >
      <ReviewMockupRail />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1">
      {chrome === "agent" ? (
        <>
          {rail}
          {documentColumn}
        </>
      ) : (
        <>
          {documentColumn}
          {rail}
        </>
      )}
    </div>
  );
}

export function ReviewMockupWorkspace() {
  const [bannerVisible, setBannerVisible] = useState(true);

  return (
    <ReviewMockupProvider>
      <div
        className="flex h-full min-h-0 flex-col bg-[var(--background)]"
        data-testid="review-mockup-workspace"
      >
        {bannerVisible ? (
          <div className="flex items-center gap-3 border-b border-[var(--brand-200)] bg-[var(--brand-50)] px-6 py-2 text-xs text-[var(--brand-800)]">
            <p className="flex-1">
              Prototype of review mode for a created document. Sample protocol
              DVP-0142 Rev B — agents, playbooks, skills and trace are interactive
              mock data, not a live AI run.
            </p>
            <button
              type="button"
              className="shrink-0 font-medium underline-offset-2 hover:underline"
              onClick={() => setBannerVisible(false)}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        <ReviewMockupHeader />
        <ReviewMockupBody />
      </div>
    </ReviewMockupProvider>
  );
}
