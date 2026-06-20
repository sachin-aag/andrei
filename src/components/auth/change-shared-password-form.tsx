"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordCriteriaChecklist } from "@/components/auth/password-criteria-checklist";
import {
  getPasswordNotRecentCheck,
  getPasswordStrengthChecks,
} from "@/lib/auth/password-strength";
import { cn } from "@/lib/utils";

const PASSWORD_REUSE_CHECK_DEBOUNCE_MS = 300;

export function ChangeSharedPasswordForm({
  email,
}: {
  email: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remotePasswordReuse, setRemotePasswordReuse] = useState<{
    password: string;
    recentlyUsed: boolean | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [switchingAccount, setSwitchingAccount] = useState(false);

  useEffect(() => {
    if (!password) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const res = await fetch("/api/auth-pw/check-password-reuse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (cancelled) return;

        if (!res.ok) {
          setRemotePasswordReuse({ password, recentlyUsed: null });
          return;
        }

        const data = (await res.json()) as { recentlyUsed?: boolean };
        if (!cancelled) {
          setRemotePasswordReuse({
            password,
            recentlyUsed: data.recentlyUsed === true,
          });
        }
      })();
    }, PASSWORD_REUSE_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [password]);

  const passwordRecentlyUsed = useMemo(() => {
    if (!password) return null;
    if (remotePasswordReuse?.password !== password) return null;
    return remotePasswordReuse.recentlyUsed;
  }, [password, remotePasswordReuse]);

  const passwordChecks = useMemo(() => {
    const checks = getPasswordStrengthChecks(password);
    const notRecentMet =
      password.length > 0 && passwordRecentlyUsed === false;

    return [...checks, getPasswordNotRecentCheck(notRecentMet)];
  }, [password, passwordRecentlyUsed]);

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
      const res = await fetch("/api/auth-pw/replace-shared-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword: confirm }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ??
            "Could not update your password. Please try again."
        );
        return;
      }
      router.push("/");
      router.refresh();
    });
  };

  const switchAccount = () => {
    setSwitchingAccount(true);
    void signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50"
        onClick={switchAccount}
        disabled={pending || switchingAccount}
      >
        <ChevronLeft className="size-4" />
        Use a different account
      </button>
      {email ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Signed in as <strong>{email}</strong>
        </p>
      ) : null}
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
          autoFocus
          disabled={pending || switchingAccount}
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
          disabled={pending || switchingAccount}
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
        disabled={
          !passwordMeetsCriteria ||
          !passwordsMatch ||
          pending ||
          switchingAccount
        }
        onClick={submit}
      >
        {pending ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <ArrowRight className="mr-2 size-4" />
        )}
        Save password and continue
      </Button>
    </div>
  );
}
