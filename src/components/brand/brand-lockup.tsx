import { getCustomerPack } from "@/lib/customers/packs";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";

export function BrandLockup({
  variant = "color",
  size = "sm",
  showTagline = false,
  name = "short",
}: {
  variant?: "color" | "hero";
  size?: "sm" | "md";
  showTagline?: boolean;
  name?: "short" | "full";
}) {
  const { branding } = getCustomerPack();
  const isWordmark = branding.logoLayout === "wordmark";
  const displayName =
    name === "full" ? branding.productName : branding.productNameShort;
  const taglineClass = cn(
    "text-xs",
    variant === "hero" ? "text-white/80" : "text-[var(--muted-foreground)]"
  );

  if (isWordmark) {
    return (
      <div className="relative flex flex-col items-start gap-1">
        <BrandLogo variant={variant} size={size} />
        {showTagline ? <div className={taglineClass}>{branding.tagline}</div> : null}
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-3">
      <BrandLogo variant={variant} size={size} />
      <div>
        <div className="font-semibold">{displayName}</div>
        {showTagline ? <div className={taglineClass}>{branding.tagline}</div> : null}
      </div>
    </div>
  );
}
