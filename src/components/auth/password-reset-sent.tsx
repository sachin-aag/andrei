import type { ReactNode } from "react";
import { MailCheck } from "lucide-react";
import { EmailDeliveryHint } from "@/components/auth/email-delivery-hint";

export function PasswordResetSent({
  email,
  children,
}: {
  email: string;
  children?: ReactNode;
}) {
  return (
    <div className="text-center space-y-3 py-4">
      <MailCheck className="size-10 mx-auto text-[var(--brand-600)]" />
      <h3 className="font-semibold">Check your email</h3>
      <p className="text-sm text-[var(--muted-foreground)]">
        If an account exists for <strong>{email}</strong>, we sent a password
        reset link. Check your inbox.
      </p>
      <p className="text-sm text-[var(--muted-foreground)]">
        Setting a new password also unlocks the account if it was locked after
        failed sign-in attempts.
      </p>
      <EmailDeliveryHint email={email} showPasswordFallback={false} />
      {children}
    </div>
  );
}
