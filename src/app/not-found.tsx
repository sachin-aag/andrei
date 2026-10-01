import type { Metadata } from "next";
import { auth } from "@/auth";
import { NotFoundView } from "@/components/not-found/not-found-view";
import { getCustomerPack } from "@/lib/customers/packs";

export function generateMetadata(): Metadata {
  const { branding } = getCustomerPack();
  return {
    title: `Page not found — ${branding.productNameShort}`,
    robots: { index: false, follow: false },
  };
}

export default async function NotFound() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.workspaceUserId);

  return <NotFoundView signedIn={signedIn} />;
}
