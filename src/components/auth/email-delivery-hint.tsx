import Link from "next/link";

type EmailDeliveryHintProps = {
  email?: string;
  /** Show link to password setup / forgot-password when email may be blocked */
  showPasswordFallback?: boolean;
};

/** Shown after magic-link or reset emails — corporate filters often block transactional mail. */
export function EmailDeliveryHint({
  email,
  showPasswordFallback = true,
}: EmailDeliveryHintProps) {
  const setupHref = email
    ? `/forgot-password?email=${encodeURIComponent(email)}&setup=1`
    : "/forgot-password?setup=1";

  return (
    <div
      role="note"
      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-left text-sm text-[var(--foreground)]"
    >
      <p className="font-medium text-amber-900 dark:text-amber-100">
        Email not arriving?
      </p>
      <p className="mt-1 text-[var(--muted-foreground)]">
        Many corporate networks block sign-in emails. Check spam, then wait a few
        minutes.
      </p>
      {showPasswordFallback && (
        <p className="mt-2 text-[var(--muted-foreground)]">
          Prefer{" "}
          <Link href="/login" className="text-[var(--brand-600)] hover:underline">
            password sign-in
          </Link>
          {email ? (
            <>
              {" "}
              or{" "}
              <Link href={setupHref} className="text-[var(--brand-600)] hover:underline">
                set a password
              </Link>
            </>
          ) : (
            <>
              {" "}
              or set a password from the login screen
            </>
          )}
          . Your admin can also send a password reset link.
        </p>
      )}
    </div>
  );
}
