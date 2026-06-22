"use client";

import { CheckCircle2, Circle } from "lucide-react";
import type { PasswordStrengthCheck } from "@/lib/auth/password-strength";
import { cn } from "@/lib/utils";

export function PasswordCriteriaChecklist({
  checks,
  showWhenEmpty = false,
}: {
  checks: PasswordStrengthCheck[];
  showWhenEmpty?: boolean;
}) {
  if (!showWhenEmpty && checks.every((check) => !check.met)) {
    return null;
  }

  return (
    <ul className="space-y-1.5" aria-live="polite">
      {checks.map((check) => (
        <li
          key={check.id}
          className={cn(
            "flex items-center gap-2 text-xs transition-colors",
            check.met ? "text-emerald-600" : "text-[var(--muted-foreground)]"
          )}
        >
          {check.met ? (
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Circle className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{check.label}</span>
        </li>
      ))}
    </ul>
  );
}
