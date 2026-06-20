"use client";

import { useMemo, useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordCriteriaChecklist } from "@/components/auth/password-criteria-checklist";
import { getPasswordStrengthChecks } from "@/lib/auth/password-strength";
import { cn } from "@/lib/utils";

export function ResetPasswordForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const passwordChecks = useMemo(
    () => getPasswordStrengthChecks(password),
    [password]
  );
  const passwordMeetsCriteria = passwordChecks.every((check) => check.met);
  const passwordsMatch =
    password.length > 0 &&
    confirm.length > 0 &&
    password === confirm;

  const submit = () => {
    if (!passwordMeetsCriteria || !passwordsMatch || pending) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/auth-pw/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error ?? "This link is invalid or expired. Please request a new one."
        );
        return;
      }
      const signInRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (signInRes?.error) {
        router.push("/login");
        return;
      }
      router.push("/");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          autoComplete="new-password"
          disabled={pending}
        />
        <PasswordCriteriaChecklist
          checks={passwordChecks}
          showWhenEmpty={password.length > 0}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (error) setError(null);
          }}
          autoComplete="new-password"
          disabled={pending}
          aria-invalid={
            confirm.length > 0 && !passwordsMatch ? true : undefined
          }
          aria-describedby={
            confirm.length > 0 ? "confirm-password-status" : undefined
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        {confirm.length > 0 ? (
          <p
            id="confirm-password-status"
            className={cn(
              "flex items-center gap-2 text-xs",
              passwordsMatch
                ? "text-emerald-600"
                : "text-[var(--muted-foreground)]"
            )}
          >
            {passwordsMatch ? (
              <>
                <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                Passwords match
              </>
            ) : (
              "Passwords do not match yet."
            )}
          </p>
        ) : null}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="button"
        className="w-full h-11"
        disabled={!passwordMeetsCriteria || !passwordsMatch || pending}
        onClick={submit}
      >
        {pending ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <ArrowRight className="mr-2 size-4" />
        )}
        Set password
      </Button>
    </div>
  );
}
