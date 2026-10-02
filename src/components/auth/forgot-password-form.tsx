"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { PasswordResetSent } from "@/components/auth/password-reset-sent";
import { sendPasswordResetEmail } from "@/components/auth/send-password-reset";

export function ForgotPasswordForm({ defaultEmail }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!email.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await sendPasswordResetEmail(email.trim());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  };

  if (sent) {
    return (
      <PasswordResetSent email={email}>
        <Link
          href="/login"
          className="text-sm text-[var(--brand-600)] hover:underline inline-block"
        >
          Back to sign in
        </Link>
      </PasswordResetSent>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reset-email">Work email</Label>
        <Input
          id="reset-email"
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
        {error && <p className="text-sm text-destructive">{error}</p>}
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
        Send reset link
      </Button>
      <div className="text-center">
        <Link
          href="/login"
          className="text-sm text-[var(--muted-foreground)] hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
