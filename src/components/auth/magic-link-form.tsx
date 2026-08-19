"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MagicLinkSent } from "@/components/auth/magic-link-sent";
import { sendMagicLinkEmail } from "@/components/auth/send-magic-link";

export function MagicLinkForm({ redirectTo }: { redirectTo?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!email.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const { allowed } = await res.json();
      if (!allowed) {
        setError("This email isn't registered. Please contact your admin to get access.");
        return;
      }
      const sentResult = await sendMagicLinkEmail(email.trim(), redirectTo);
      if (!sentResult.ok) {
        setError(sentResult.error);
        return;
      }
      setSent(true);
    });
  };

  if (sent) {
    return (
      <MagicLinkSent email={email}>
        <button
          type="button"
          className="text-sm text-[var(--brand-600)] hover:underline"
          onClick={() => {
            setSent(false);
            setEmail("");
          }}
        >
          Use a different email
        </button>
      </MagicLinkSent>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          placeholder="you@company.com"
          autoComplete="email"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
      <Button
        type="button"
        className="w-full h-11"
        disabled={!email.trim() || pending}
        onClick={submit}
      >
        {pending ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <ArrowRight className="mr-2 size-4" />
        )}
        Send sign-in link
      </Button>
    </div>
  );
}
