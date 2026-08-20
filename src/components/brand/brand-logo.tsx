import Image from "next/image";
import { getCustomerPack, type LogoLayout } from "@/lib/customers/packs";
import { cn } from "@/lib/utils";

const ICON_CHROME = {
  sm: { box: "size-10", img: 32 },
  md: { box: "size-12", img: 36 },
} as const;

/** Display box for the Convergent wordmark (PNG is 1198×273). */
const WORDMARK_CHROME = {
  sm: { heightClass: "h-10", width: 176, height: 40 },
  md: { heightClass: "h-12", width: 211, height: 48 },
} as const;

function logoImageProps(src: string) {
  return {
    src,
    unoptimized: src.endsWith(".svg"),
  };
}

function compactChrome(layout: LogoLayout): { box: string; img: number } {
  switch (layout) {
    case "wordmark":
      return { box: "size-12", img: 48 };
    case "icon":
      return { box: "size-9 p-1", img: 28 };
    default: {
      const exhaustive: never = layout;
      return exhaustive;
    }
  }
}

export function BrandLogo({
  variant = "color",
  size = "sm",
  compact = false,
  className,
}: {
  variant?: "color" | "hero";
  size?: "sm" | "md";
  /** Collapsed sidebar: square mark, not the full wordmark. */
  compact?: boolean;
  className?: string;
}) {
  const { branding } = getCustomerPack();
  const layout = branding.logoLayout;
  const onWhite = variant === "hero" && branding.heroLogoOnWhite;
  const wordmarkSrc = variant === "hero" ? branding.heroLogoSrc : branding.logoSrc;

  if (compact) {
    const chrome = compactChrome(layout);
    return (
      <div
        className={cn(
          chrome.box,
          "rounded-lg flex items-center justify-center shrink-0 overflow-hidden",
          onWhite ? "bg-white" : variant === "hero" ? "bg-white/10" : "bg-white",
          className
        )}
      >
        <Image
          {...logoImageProps(branding.logoMarkSrc)}
          width={chrome.img}
          height={chrome.img}
          alt={branding.logoAlt}
          className="size-full object-contain"
        />
      </div>
    );
  }

  switch (layout) {
    case "icon": {
      const icon = ICON_CHROME[size];
      return (
        <div
          className={cn(
            icon.box,
            "p-1 rounded-lg flex items-center justify-center shrink-0 overflow-hidden",
            onWhite ? "bg-white" : variant === "hero" ? "bg-white/10" : "bg-white",
            className
          )}
        >
          <Image
            {...logoImageProps(wordmarkSrc)}
            width={icon.img}
            height={icon.img}
            alt={branding.logoAlt}
            className="size-full object-contain"
          />
        </div>
      );
    }
    case "wordmark": {
      const wordmark = WORDMARK_CHROME[size];
      return (
        <div
          className={cn(
            "rounded-lg px-2.5 py-1.5 flex items-center justify-center shrink-0",
            onWhite || variant !== "hero" ? "bg-white" : "bg-white/10",
            className
          )}
        >
          <Image
            {...logoImageProps(wordmarkSrc)}
            width={wordmark.width}
            height={wordmark.height}
            alt={branding.logoAlt}
            className={cn(wordmark.heightClass, "w-auto object-contain")}
          />
        </div>
      );
    }
    default: {
      const exhaustive: never = layout;
      return exhaustive;
    }
  }
}
