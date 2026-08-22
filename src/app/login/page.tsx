import Link from "next/link";
import { redirect } from "next/navigation";
import { MagicLinkSent } from "@/components/auth/magic-link-sent";
import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { loginErrorMessage } from "@/lib/auth/login-error-message";
import { getCurrentUser } from "@/lib/auth/session";
import { getCustomerPack } from "@/lib/customers/packs";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    verify?: string;
    error?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { callbackUrl, verify, error } = await searchParams;
  const { branding } = getCustomerPack();
  const headlineLines = branding.loginHeadline.split("\n");
  const errorMessage = loginErrorMessage(error);
  const showMagicLinkSent = verify === "1" && !errorMessage;

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex flex-1 bg-[var(--brand-600)] text-white p-16 flex-col justify-between relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 25%, white 2px, transparent 2px), radial-gradient(circle at 75% 75%, white 2px, transparent 2px)",
            backgroundSize: "40px 40px, 40px 40px",
            backgroundPosition: "0 0, 20px 20px",
          }}
        />
        <BrandLockup variant="hero" size="md" showTagline name="full" />
        <div className="relative">
          <h2 className="text-4xl font-bold leading-tight mb-3">
            {headlineLines.map((line, index) => (
              <span key={line}>
                {line}
                {index < headlineLines.length - 1 ? <br /> : null}
              </span>
            ))}
          </h2>
          <p className="max-w-md text-white/90">{branding.loginSubhead}</p>
        </div>
        <div className="relative text-xs text-white/70">{branding.loginFooter}</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <BrandLockup />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Sign in to your workspace
            </h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-2">
              Sign in with your work email and password. You can also request a
              sign-in link by email.
            </p>
          </div>
          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}
          {showMagicLinkSent ? (
            <MagicLinkSent>
              <Link
                href="/login"
                className="text-sm text-[var(--brand-600)] hover:underline"
              >
                Back to sign in
              </Link>
            </MagicLinkSent>
          ) : (
            <PasswordLoginForm redirectTo={callbackUrl ?? "/"} />
          )}
        </div>
      </div>
    </div>
  );
}
