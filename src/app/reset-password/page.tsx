import Image from "next/image";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getCurrentUser } from "@/lib/auth/session";
import Link from "next/link";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { token, email } = await searchParams;

  if (!token || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Invalid reset link
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            This link is missing required parameters. Please request a new
            password reset.
          </p>
          <Link
            href="/forgot-password"
            className="text-sm text-[var(--brand-600)] hover:underline inline-block"
          >
            Request a new link
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-white p-1">
            <Image
              src="/logo.png"
              width={32}
              height={32}
              alt="MJ Biopharm logo"
              className="object-contain"
              style={{ width: "auto", height: "auto" }}
            />
          </div>
          <div className="font-semibold">M.J. Biopharm</div>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Set a new password
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            Choose a strong password for{" "}
            <strong className="text-[var(--foreground)]">{email}</strong>.
          </p>
        </div>
        <ResetPasswordForm token={token} email={email} />
      </div>
    </div>
  );
}
