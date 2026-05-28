"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      await signIn("resend", {
        email: email.trim(),
        redirectTo: redirectTo ?? "/",
        redirect: false,
      });
      setSent(true);
    });
  };

  if (sent) {
    return (
      <div className="text-center space-y-3 py-4">
        <MailCheck className="size-10 mx-auto text-[var(--brand-600)]" />
        <h3 className="font-semibold">Check your email</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          We sent a sign-in link to <strong>{email}</strong>. Click it to sign
          in.
        </p>
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
      </div>
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
          placeholder="you@mjbiopharm.com"
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
