"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { captureEvent } from "@/lib/analytics/events";

type Step =
  | { kind: "email" }
  | { kind: "password"; email: string }
  | { kind: "no-password"; email: string };

export function PasswordLoginForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const clearError = () => {
    if (error) setError(null);
  };

  const goBack = () => {
    setStep({ kind: "email" });
    setPassword("");
    setError(null);
  };

  const checkEmail = () => {
    if (!email.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const { allowed, hasPassword } = await res.json();
      if (!allowed) {
        setError(
          "This email isn't registered. Please contact your admin to get access."
        );
        return;
      }
      const trimmed = email.trim();
      if (hasPassword) {
        setStep({ kind: "password", email: trimmed });
      } else {
        setStep({ kind: "no-password", email: trimmed });
      }
    });
  };

  const submitPassword = () => {
    if (step.kind !== "password" || !password) return;
    setError(null);
    startTransition(async () => {
      const res = await signIn("credentials", {
        email: step.email,
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid password. Please try again.");
        return;
      }
      captureEvent("user_logged_in");
      router.push(redirectTo ?? "/");
      router.refresh();
    });
  };

  if (step.kind === "no-password") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          onClick={goBack}
        >
          <ChevronLeft className="size-4" />
          Back
        </button>
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Signing in as <strong>{step.email}</strong>
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-4 space-y-3">
          <p className="text-sm">
            No password is set for this account. Ask your admin for a temporary
            password, or set one below if reset email delivery works for you.
          </p>
          <Button type="button" className="w-full h-11" asChild>
            <Link
              href={`/forgot-password?email=${encodeURIComponent(step.email)}&setup=1`}
            >
              Set up a password
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (step.kind === "password") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          onClick={goBack}
        >
          <ChevronLeft className="size-4" />
          Back
        </button>
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Signing in as <strong>{step.email}</strong>
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw-password">Password</Label>
          <Input
            id="pw-password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearError();
            }}
            placeholder="Enter your password"
            autoComplete="current-password"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") submitPassword();
            }}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="button"
          className="w-full h-11"
          disabled={!password || pending}
          onClick={submitPassword}
        >
          {pending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <ArrowRight className="mr-2 size-4" />
          )}
          Sign in
        </Button>
        <Link
          href={`/forgot-password?email=${encodeURIComponent(step.email)}`}
          className="text-sm text-[var(--muted-foreground)] hover:underline"
        >
          Forgot password?
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pw-email">Work email</Label>
        <Input
          id="pw-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearError();
          }}
          placeholder="you@mjbiopharm.com"
          autoComplete="email"
          onKeyDown={(e) => {
            if (e.key === "Enter") checkEmail();
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="button"
        className="w-full h-11"
        disabled={!email.trim() || pending}
        onClick={checkEmail}
      >
        {pending ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <ArrowRight className="mr-2 size-4" />
        )}
        Continue
      </Button>
    </div>
  );
}
