"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DOC_INSIGHT_CARDS } from "@/lib/insights/mock-data";

export function DocInsightsCards() {
  const [toggles, setToggles] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DOC_INSIGHT_CARDS.map((c) => [c.id, c.enabled]))
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {DOC_INSIGHT_CARDS.map((card) => (
        <Card key={card.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">{card.title}</CardTitle>
              <CardDescription className="mt-1">{card.description}</CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <input
                type="checkbox"
                checked={!!toggles[card.id]}
                onChange={(e) =>
                  setToggles((prev) => ({ ...prev, [card.id]: e.target.checked }))
                }
                className="h-4 w-4 accent-[var(--brand-600)]"
                aria-label={`Toggle ${card.title}`}
              />
              Customize
            </label>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--muted-foreground)]">
              {toggles[card.id]
                ? "Preview enabled — connect live analytics in production."
                : "Disabled for this demo view."}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
