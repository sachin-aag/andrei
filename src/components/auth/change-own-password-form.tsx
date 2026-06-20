"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
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

export function ChangeOwnPasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [currentPasswordVerified, setCurrentPasswordVerified] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(
    null
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordRecentlyUsed, setPasswordRecentlyUsed] = useState<boolean | null>(
    null
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [verifyPending, startVerifyTransition] = useTransition();
  const [submitPending, startSubmitTransition] = useTransition();

  useEffect(() => {
    if (!currentPasswordVerified || !password) {
      setPasswordRecentlyUsed(null);
      return;
    }

    if (password === currentPassword) {
      setPasswordRecentlyUsed(true);
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
          setPasswordRecentlyUsed(null);
          return;
        }

        const data = (await res.json()) as { recentlyUsed?: boolean };
        if (!cancelled) {
          setPasswordRecentlyUsed(data.recentlyUsed === true);
        }
      })();
    }, PASSWORD_REUSE_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [currentPassword, currentPasswordVerified, password]);

  const passwordChecks = useMemo(() => {
    const checks = getPasswordStrengthChecks(password);
    if (!currentPasswordVerified) return checks;

    const notRecentMet =
      password.length > 0 &&
      password !== currentPassword &&
      passwordRecentlyUsed === false;

    return [...checks, getPasswordNotRecentCheck(notRecentMet)];
  }, [
    currentPassword,
    currentPasswordVerified,
    password,
    passwordRecentlyUsed,
  ]);
  const passwordMeetsCriteria = passwordChecks.every((check) => check.met);
  const passwordsMatch =
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  const resetVerifiedState = () => {
    setCurrentPasswordVerified(false);
    setCurrentPasswordError(null);
    setPassword("");
    setConfirmPassword("");
    setPasswordRecentlyUsed(null);
    setSubmitError(null);
    setSuccess(false);
  };

  const verifyCurrentPassword = () => {
    if (!currentPassword || verifyPending) return;

    startVerifyTransition(async () => {
      const res = await fetch("/api/auth-pw/verify-current-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCurrentPasswordVerified(false);
        setCurrentPasswordError(
          (data as { error?: string }).error ??
            "Could not verify your current password."
        );
        return;
      }

      setCurrentPasswordVerified(true);
      setCurrentPasswordError(null);
      setSubmitError(null);
      setSuccess(false);
    });
  };

  const submit = () => {
    if (
      !currentPasswordVerified ||
      !passwordMeetsCriteria ||
      !passwordsMatch ||
      submitPending
    ) {
      return;
    }

    startSubmitTransition(async () => {
      const res = await fetch("/api/auth-pw/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, password, confirmPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(
          (data as { error?: string }).error ??
            "Could not update your password. Please try again."
        );
        setSuccess(false);
        return;
      }

      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setCurrentPasswordVerified(false);
      setPasswordRecentlyUsed(null);
      setCurrentPasswordError(null);
      setSubmitError(null);
      setSuccess(true);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value);
            if (currentPasswordVerified || currentPasswordError) {
              resetVerifiedState();
            }
          }}
          autoComplete="current-password"
          disabled={verifyPending || submitPending}
          aria-invalid={currentPasswordError ? true : undefined}
          aria-describedby={
            currentPasswordError
              ? "current-password-error"
              : currentPasswordVerified
                ? "current-password-success"
                : undefined
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && !currentPasswordVerified) {
              e.preventDefault();
              verifyCurrentPassword();
            }
          }}
        />
        {currentPasswordError ? (
          <p id="current-password-error" className="text-sm text-destructive">
            {currentPasswordError}
          </p>
        ) : null}
        {currentPasswordVerified ? (
          <p
            id="current-password-success"
            className="flex items-center gap-2 text-sm text-emerald-600"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            Current password verified
          </p>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={!currentPassword || verifyPending || submitPending}
            onClick={verifyCurrentPassword}
          >
            {verifyPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Verify current password
          </Button>
        )}
      </div>

      {currentPasswordVerified ? (
        <div className="space-y-4 border-t border-[var(--border)] pt-4">
          <div className="space-y-2">
            <Label htmlFor="profile-new-password">New password</Label>
            <Input
              id="profile-new-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (submitError) setSubmitError(null);
                if (success) setSuccess(false);
              }}
              autoComplete="new-password"
              disabled={submitPending}
              autoFocus
            />
            <PasswordCriteriaChecklist
              checks={passwordChecks}
              showWhenEmpty={password.length > 0}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-confirm-password">
              Confirm new password
            </Label>
            <Input
              id="profile-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (submitError) setSubmitError(null);
                if (success) setSuccess(false);
              }}
              autoComplete="new-password"
              disabled={submitPending}
              aria-invalid={
                confirmPassword.length > 0 && !passwordsMatch ? true : undefined
              }
              aria-describedby={
                confirmPassword.length > 0
                  ? "confirm-password-status"
                  : undefined
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            {confirmPassword.length > 0 ? (
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

          {submitError ? (
            <p className="text-sm text-destructive">{submitError}</p>
          ) : null}
          {success ? (
            <p className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              Password updated.
            </p>
          ) : null}

          <Button
            type="button"
            className="h-11 w-full"
            disabled={
              !passwordMeetsCriteria ||
              !passwordsMatch ||
              submitPending ||
              verifyPending
            }
            onClick={submit}
          >
            {submitPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Change password
          </Button>
        </div>
      ) : null}
    </div>
  );
}
