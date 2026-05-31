import Image from "next/image";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getCurrentUser } from "@/lib/auth/session";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { email } = await searchParams;

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
            Reset your password
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            Enter your work email and we&apos;ll send you a link to set a new
            password.
          </p>
        </div>
        <ForgotPasswordForm defaultEmail={email} />
      </div>
    </div>
  );
}
