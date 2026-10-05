"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ASSISTANT_STARTERS } from "@/lib/review-mockup/sample-data";
import { useReviewMockup } from "./review-mockup-state";

export function AssistantPanel() {
  const { assistantMessages, sendAssistant } = useReviewMockup();
  const [draft, setDraft] = useState("");

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    sendAssistant(draft);
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {assistantMessages.length === 0 ? (
          <div className="flex flex-col items-start gap-3 pt-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--brand-700)] text-white">
              <Sparkles className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Review assistant</h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
                Ask about findings on DVP-0142, or run Agents / Playbooks for a structured
                review. This prototype answers from the sample protocol.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {ASSISTANT_STARTERS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendAssistant(prompt)}
                  className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-left text-xs hover:bg-[var(--secondary)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          assistantMessages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-6 rounded-lg bg-[var(--brand-700)] px-3 py-2 text-xs text-white"
                  : "mr-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 px-3 py-2 text-xs leading-relaxed"
              }
            >
              {message.text}
            </div>
          ))
        )}
      </div>
      <form
        onSubmit={submit}
        className="mt-3 flex items-end gap-2 border-t border-[var(--border)] pt-3"
      >
        <label className="sr-only" htmlFor="review-mockup-assistant">
          Message the review assistant
        </label>
        <textarea
          id="review-mockup-assistant"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          placeholder="Ask about this protocol…"
          className="min-h-[40px] flex-1 resize-none rounded-md border border-[var(--input)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        />
        <Button type="submit" size="icon" aria-label="Send" disabled={!draft.trim()}>
          <ArrowUp className="size-4" />
        </Button>
      </form>
    </div>
  );
}
