import type { ReactNode } from "react";
import { MailCheck } from "lucide-react";
import { EmailDeliveryHint } from "@/components/auth/email-delivery-hint";

export function MagicLinkSent({
  email,
  children,
}: {
  email?: string;
  children?: ReactNode;
}) {
  return (
    <div className="text-center space-y-3 py-4">
      <MailCheck className="size-10 mx-auto text-[var(--brand-600)]" />
      <h3 className="font-semibold">Check your email</h3>
      <p className="text-sm text-[var(--muted-foreground)]">
        {email ? (
          <>
            We sent a sign-in link to <strong>{email}</strong>. Click it to sign
            in.
          </>
        ) : (
          <>We sent a sign-in link to your email. Click it to sign in.</>
        )}
      </p>
      <EmailDeliveryHint email={email} />
      {children}
    </div>
  );
}
