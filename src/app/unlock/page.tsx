import Image from "next/image";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  SITE_ACCESS_COOKIE,
  verifySiteAccessToken,
} from "@/lib/site-access-token";
import { UnlockForm } from "@/components/auth/unlock-form";

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
        : "/";
    redirect(safe);
  }

  const { next: nextPath } = await searchParams;
  const nextHref =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/";

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
            />
          </div>
          <div>
            <div className="font-semibold">M.J. Biopharm Private Limited</div>
            <div className="text-xs">Drug Product · Hinjawadi</div>
          </div>
        </div>
        <div className="relative">
          <h2 className="text-4xl font-bold leading-tight mb-3">
            Site access
          </h2>
          <p className="max-w-md text-white/90">
            Enter the shared access password to continue.
          </p>
        </div>
        <div className="relative text-xs opacity-80">
          Ref. SOP No.: SOP/DP/QA/008 · Form: SOP/DP/QA/008/F04-R02
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-3">
            <div className="size-10 rounded-lg bg-white p-1 border border-border">
              <Image
                src="/logo.png"
                width={32}
                height={32}
                alt="MJ Biopharm logo"
              />
            </div>
            <div className="font-semibold">M.J. Biopharm</div>
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
