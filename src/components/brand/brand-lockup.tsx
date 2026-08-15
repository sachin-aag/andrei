import Image from "next/image";
import { getCustomerPack } from "@/lib/customers/packs";
import { cn } from "@/lib/utils";

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
  const src = variant === "hero" ? branding.heroLogoSrc : branding.logoSrc;
  const box = size === "md" ? "size-12" : "size-10";
  const img = size === "md" ? 36 : 32;
  const onWhite = variant === "hero" && branding.heroLogoOnWhite;
  const displayName =
    name === "full" ? branding.productName : branding.productNameShort;

  return (
    <div className="relative flex items-center gap-3">
      <div
        className={cn(
          box,
          "rounded-lg p-1 flex items-center justify-center shrink-0",
          onWhite ? "bg-white" : variant === "hero" ? "bg-white/10" : "bg-white"
        )}
      >
        <Image
          src={src}
          width={img}
          height={img}
          alt={branding.logoAlt}
          className="object-contain"
          style={{ width: "auto", height: "auto" }}
        />
      </div>
      <div>
        <div className="font-semibold">{displayName}</div>
        {showTagline ? (
          <div
            className={cn(
              "text-xs",
              variant === "hero" ? "text-white/80" : "text-[var(--muted-foreground)]"
            )}
          >
            {branding.tagline}
          </div>
        ) : null}
      </div>
    </div>
  );
}
