import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { getCurrentUser } from "@/lib/auth/session";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; setup?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { email, setup } = await searchParams;
  const isSetup = setup === "1";

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <BrandLockup />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isSetup ? "Set your password" : "Reset your password"}
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            {isSetup
              ? "We\u2019ll send you a link to set up a password for your account."
              : "Enter your work email and we\u2019ll send you a link to set a new password."}
          </p>
        </div>
        <ForgotPasswordForm defaultEmail={email} />
      </div>
    </div>
  );
}
