"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Shared body for the App Router `error.tsx` files. */
export function RouteErrorView({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-1 items-center justify-center bg-[var(--background)] p-8"
    >
      <div className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-pretty text-2xl font-semibold tracking-tight">
            This page hit a problem
          </h1>
          <p className="mt-2 text-pretty text-sm text-[var(--muted-foreground)]">
            Your saved work is not affected. Try again, or reload the page if
            it keeps happening.
          </p>
          {error.digest ? (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Reload page
          </Button>
          <Button type="button" variant="ghost" asChild>
            {/* Full navigation: the client router may be what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Back to reports</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
