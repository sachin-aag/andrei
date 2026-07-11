import Image from "next/image";
import { redirect } from "next/navigation";
import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { getCurrentUser } from "@/lib/auth/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { callbackUrl } = await searchParams;

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
        <div className="relative flex items-center gap-3">
          <div className="size-12 rounded-lg bg-white/10 p-1 flex items-center justify-center">
            <Image
              src="/logo-white.png"
              width={36}
              height={36}
              alt="Andrei logo"
              className="object-contain"
              style={{ width: "auto", height: "auto" }}
            />
          </div>
          <div>
            <div className="font-semibold">Andrei</div>
            <div className="text-xs text-white/80">Quality Documentation</div>
          </div>
        </div>
        <div className="relative">
          <h2 className="text-4xl font-bold leading-tight mb-3">
            Document review and drafting,
            <br /> accelerated.
          </h2>
          <p className="max-w-md text-white/90">
            Draft investigation reports with AI-assisted quality checks,
            streamlined manager review, and one-click DOCX export.
          </p>
        </div>
        <div className="relative text-xs text-white/70">
          Better documents. Better outcomes.
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-3">
            <div className="size-10 rounded-lg bg-white p-1">
              <Image
                src="/logo.png"
                width={32}
                height={32}
                alt="Andrei logo"
                className="object-contain"
                style={{ width: "auto", height: "auto" }}
              />
            </div>
            <div className="font-semibold">Andrei</div>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Sign in to your workspace
            </h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-2">
              Enter your work email and password. Contact your admin if you need
              access or a password reset link.
            </p>
          </div>
          <PasswordLoginForm redirectTo={callbackUrl ?? "/"} />
        </div>
      </div>
    </div>
  );
}
