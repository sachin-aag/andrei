"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { emitWorkspaceLoadStage } from "@/lib/workspace-load-telemetry-client";

type Props = {
  section: string;
  title: string;
  children: ReactNode;
};

type State = { failed: boolean };

/**
 * One section that throws while rendering must not take the report down.
 * The other sections stay editable; this one offers a retry.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Section "${this.props.section}" failed to render`, error, info);
    emitWorkspaceLoadStage("error", {
      kind: "section_render",
      section: this.props.section,
      message: String(error?.message ?? error).slice(0, 200),
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        data-testid={`section-error-${this.props.section}`}
        className="space-y-3"
      >
        <h2 className="text-xl font-semibold">{this.props.title}</h2>
        <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-4">
          <p className="text-sm">This section could not be displayed.</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Your saved content is not affected. The rest of the report is
            still available.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => this.setState({ failed: false })}
            >
              Try again
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
