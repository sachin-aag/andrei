"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangeSharedPasswordForm({
  email,
  minLength,
  passwordRequirements,
}: {
  email: string;
  minLength: number;
  passwordRequirements: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [switchingAccount, setSwitchingAccount] = useState(false);

  const submit = () => {
    if (!password || !confirm) return;
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < minLength) {
      setError(`Password must be at least ${minLength} characters.`);
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
          placeholder={`At least ${minLength} characters`}
          autoComplete="off"
          autoFocus
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          {passwordRequirements}
        </p>
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
          placeholder="Repeat your password"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="button"
        className="w-full h-11"
        disabled={!password || !confirm || pending || switchingAccount}
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
