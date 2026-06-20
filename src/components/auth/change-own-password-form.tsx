"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangeOwnPasswordForm({
  minLength,
  passwordRequirements,
}: {
  minLength: number;
  passwordRequirements: string;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const clearMessages = () => {
    if (error) setError(null);
    if (success) setSuccess(false);
  };

  const submit = () => {
    if (!currentPassword || !password || !confirmPassword) return;
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setSuccess(false);
      return;
    }
    if (password.length < minLength) {
      setError(`Password must be at least ${minLength} characters.`);
      setSuccess(false);
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/auth-pw/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, password, confirmPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ??
            "Could not update your password. Please try again."
        );
        setSuccess(false);
        return;
      }

      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setError(null);
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
            clearMessages();
          }}
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-new-password">New password</Label>
        <Input
          id="profile-new-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearMessages();
          }}
          placeholder={`At least ${minLength} characters`}
          autoComplete="off"
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          {passwordRequirements}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-confirm-password">Confirm new password</Label>
        <Input
          id="profile-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            clearMessages();
          }}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? (
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Password updated.
        </p>
      ) : null}
      <Button
        type="button"
        className="w-full h-11"
        disabled={!currentPassword || !password || !confirmPassword || pending}
        onClick={submit}
      >
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Change password
      </Button>
    </div>
  );
}
