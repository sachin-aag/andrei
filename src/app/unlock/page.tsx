import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  SITE_ACCESS_COOKIE,
  verifySiteAccessToken,
} from "@/lib/site-access-token";
import { UnlockForm } from "@/components/auth/unlock-form";
import { BrandLockup } from "@/components/brand/brand-lockup";

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const secret = process.env.SITE_ACCESS_PASSWORD?.trim();
  if (!secret) {
    redirect("/login");
  }

  const store = await cookies();
  const existing = store.get(SITE_ACCESS_COOKIE)?.value;
  if (existing && (await verifySiteAccessToken(existing, secret))) {
    const { next: nextPath } = await searchParams;
    const safe =
      nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
        ? nextPath
        : "/login";
    redirect(safe);
  }

  const { next: nextPath } = await searchParams;
  const nextHref =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/login";

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
            Site access
          </h2>
          <p className="max-w-md text-white/90">
            Enter the shared access password to continue.
          </p>
        </div>
        <div className="relative text-xs text-white/70">
          Restricted demo environment
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <BrandLockup />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Enter access password
            </h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-2">
              This site is restricted. Ask your administrator for the password.
            </p>
          </div>
          <UnlockForm nextHref={nextHref} />
        </div>
      </div>
    </div>
  );
}
