import { BrandLockup } from "@/components/brand/brand-lockup";
import { Button } from "@/components/ui/button";
import { getCustomerPack } from "@/lib/customers/packs";

const HERO_DOT_GRID = {
  backgroundImage:
    "radial-gradient(circle at 25% 25%, white 2px, transparent 2px), radial-gradient(circle at 75% 75%, white 2px, transparent 2px)",
  backgroundSize: "40px 40px, 40px 40px",
  backgroundPosition: "0 0, 20px 20px",
} as const;

export function NotFoundView({ signedIn }: { signedIn: boolean }) {
  const { branding } = getCustomerPack();
  const homeHref = signedIn ? "/" : "/login";
  const homeLabel = signedIn ? "Back to reports" : "Sign in";

  return (
    <div className="flex min-h-dvh">
      <div className="relative hidden overflow-hidden bg-[var(--brand-600)] p-16 text-white lg:flex lg:flex-1 lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          aria-hidden="true"
          style={HERO_DOT_GRID}
        />
        <BrandLockup variant="hero" size="md" showTagline name="full" />
        <div className="relative">
          <p
            className="text-[clamp(4.5rem,10vw,7rem)] font-bold leading-none tracking-tight tabular-nums"
            aria-hidden="true"
          >
            404
          </p>
          <p className="mt-4 max-w-md text-white/90">
            This workspace doesn’t have that page.
          </p>
        </div>
        <p className="relative text-xs text-white/70">{branding.loginFooter}</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <main className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <BrandLockup />
          </div>
          <p
            className="text-5xl font-bold tracking-tight text-[var(--brand-600)] tabular-nums lg:hidden"
            aria-hidden="true"
          >
            404
          </p>
          <div>
            <h1 className="text-pretty text-2xl font-semibold tracking-tight">
              This page isn’t here
            </h1>
            <p className="mt-2 text-pretty text-sm text-[var(--muted-foreground)]">
              This address doesn’t match a page in {branding.productNameShort}.
              The link may be outdated, or you may not have access to that
              document.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href={homeHref}>{homeLabel}</a>
            </Button>
            {signedIn ? (
              <Button asChild variant="outline">
                <a href="/vault">Document vault</a>
              </Button>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
