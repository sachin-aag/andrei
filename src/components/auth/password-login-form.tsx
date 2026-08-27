"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MagicLinkSent } from "@/components/auth/magic-link-sent";
import { sendMagicLinkEmail } from "@/components/auth/send-magic-link";
import { captureEvent } from "@/lib/analytics/events";
import { DEACTIVATED_ACCOUNT_MESSAGE } from "@/lib/auth/login-status-messages";

type EmailCheckResult =
  | {
      ok: true;
      allowed: boolean;
      hasPassword: boolean;
      locked: boolean;
      deactivated: boolean;
    }
  | { ok: false; error: string };

type Step =
  | { kind: "email" }
  | { kind: "password"; email: string; locked: boolean }
  | { kind: "no-password"; email: string }
  | { kind: "magic-link-sent"; email: string };

const EMAIL_CHECK_ERROR =
  "Could not check this email. Please try again or contact your admin.";
const LOCKED_ACCOUNT_MESSAGE =
  "This account is locked after too many failed password attempts. Reset your password, request a sign-in link, or contact your admin.";

async function readEmailCheckResult(res: Response): Promise<EmailCheckResult> {
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    return {
      ok: false,
      error:
        typeof data?.error === "string" && data.error
          ? data.error
          : EMAIL_CHECK_ERROR,
    };
  }

  if (!data || typeof data.allowed !== "boolean") {
    return { ok: false, error: EMAIL_CHECK_ERROR };
  }

  return {
    ok: true,
    allowed: data.allowed,
    hasPassword: !!data.hasPassword,
    locked: !!data.locked,
    deactivated: !!data.deactivated,
  };
}

async function checkRegisteredEmail(emailValue: string): Promise<EmailCheckResult> {
  return fetch("/api/auth/check-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailValue }),
  })
    .then(readEmailCheckResult)
    .catch(
      (): EmailCheckResult => ({ ok: false, error: EMAIL_CHECK_ERROR })
    );
}

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
      const result = await checkRegisteredEmail(email.trim());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { allowed, hasPassword, locked, deactivated } = result;
      if (deactivated) {
        setError(DEACTIVATED_ACCOUNT_MESSAGE);
        return;
      }
      if (!allowed) {
        setError(
          "This email isn't registered. Please contact your admin to get access."
        );
        return;
      }
      const trimmed = email.trim();
      if (locked) {
        setStep({ kind: "password", email: trimmed, locked: true });
        return;
      }
      if (hasPassword) {
        setStep({ kind: "password", email: trimmed, locked: false });
      } else {
        setStep({ kind: "no-password", email: trimmed });
      }
    });
  };

  const sendMagicLink = (targetEmail: string) => {
    setError(null);
    startTransition(async () => {
      const result = await sendMagicLinkEmail(targetEmail, redirectTo);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStep({ kind: "magic-link-sent", email: targetEmail });
    });
  };

  const sendMagicLinkFromEmailStep = () => {
    if (!email.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await checkRegisteredEmail(email.trim());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.deactivated) {
        setError(DEACTIVATED_ACCOUNT_MESSAGE);
        return;
      }
      if (!result.allowed) {
        setError(
          "This email isn't registered. Please contact your admin to get access."
        );
        return;
      }
      const trimmed = email.trim();
      const sent = await sendMagicLinkEmail(trimmed, redirectTo);
      if (!sent.ok) {
        setError(sent.error);
        return;
      }
      setStep({ kind: "magic-link-sent", email: trimmed });
    });
  };

  const submitPassword = () => {
    if (step.kind !== "password" || step.locked || !password) return;
    setError(null);
    startTransition(async () => {
      const res = await signIn("credentials", {
        email: step.email,
        password,
        redirect: false,
      });
      if (res?.error) {
        const statusRes = await fetch("/api/auth/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: step.email }),
        });
        const status = await statusRes.json().catch(() => ({}));
        if (status.locked) {
          setStep({ kind: "password", email: step.email, locked: true });
          setError(null);
        } else {
          setError("Invalid password. Please try again.");
        }
        return;
      }
      captureEvent("user_logged_in");
      router.push(redirectTo ?? "/");
      router.refresh();
    });
  };

  if (step.kind === "magic-link-sent") {
    return (
      <MagicLinkSent email={step.email}>
        <button
          type="button"
          className="text-sm text-[var(--brand-600)] hover:underline"
          onClick={() => {
            setStep({ kind: "email" });
            setEmail("");
            setPassword("");
            setError(null);
          }}
        >
          Use a different email
        </button>
      </MagicLinkSent>
    );
  }

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
            No password is set for this account. Set one to sign in with a
            password, or request a sign-in link by email.
          </p>
          <div className="flex flex-col gap-2">
            <Button type="button" className="w-full h-11" asChild>
              <Link
                href={`/forgot-password?email=${encodeURIComponent(step.email)}&setup=1`}
              >
                Set up a password
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full h-11"
              disabled={pending}
              onClick={() => sendMagicLink(step.email)}
            >
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Email me a sign-in link
            </Button>
          </div>
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
        {step.locked ? (
          <p id="locked-account-warning" className="text-sm text-destructive">
            {LOCKED_ACCOUNT_MESSAGE}
          </p>
        ) : null}
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
            autoComplete="off"
            disabled={step.locked || pending}
            aria-describedby={
              step.locked ? "locked-account-warning" : undefined
            }
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
          disabled={step.locked || !password || pending}
          onClick={submitPassword}
        >
          {pending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <ArrowRight className="mr-2 size-4" />
          )}
          Sign in
        </Button>
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/forgot-password?email=${encodeURIComponent(step.email)}`}
            className="text-sm text-[var(--muted-foreground)] hover:underline"
          >
            Forgot password?
          </Link>
          <button
            type="button"
            className="text-sm text-[var(--brand-600)] hover:underline disabled:opacity-50"
            disabled={pending}
            onClick={() => sendMagicLink(step.email)}
          >
            Email me a sign-in link
          </button>
        </div>
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
          placeholder="you@company.com"
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
      <button
        type="button"
        className="w-full text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:underline disabled:opacity-50"
        disabled={!email.trim() || pending}
        onClick={sendMagicLinkFromEmailStep}
      >
        Email me a sign-in link instead
      </button>
    </div>
  );
}
