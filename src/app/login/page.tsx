import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/session";
import { MOCK_USERS } from "@/lib/auth/mock-users";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

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
          <div className="size-12 rounded-lg bg-white p-1 flex items-center justify-center">
            <Image
              src="/logo.png"
              width={36}
              height={36}
              alt="MJ Biopharm logo"
              className="object-contain"
              style={{ width: "auto", height: "auto" }}
            />
          </div>
          <div>
            <div className="font-semibold">M.J. Biopharm Private Limited</div>
            <div className="text-xs">Drug Product · Hinjawadi</div>
          </div>
        </div>
        <div className="relative">
          <h2 className="text-4xl font-bold leading-tight mb-3">
            Investigation Reporting,
            <br /> accelerated.
          </h2>
          <p className="max-w-md">
            Draft DMAIC deviation reports with AI-assisted quality checks,
            streamlined manager review, and one-click DOCX export matching
            SOP/DP/QA/008.
          </p>
        </div>
        <div className="relative text-xs">
          Ref. SOP No.: SOP/DP/QA/008 · Form: SOP/DP/QA/008/F04-R02
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
                alt="MJ Biopharm logo"
                className="object-contain"
                style={{ width: "auto", height: "auto" }}
              />
            </div>
            <div className="font-semibold">M.J. Biopharm</div>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Sign in to your workspace
            </h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-2">
              Pick a mock user to continue. In production, this would be SSO.
            </p>
          </div>
          <LoginForm users={[...MOCK_USERS]} />
        </div>
      </div>
    </div>
  );
}
