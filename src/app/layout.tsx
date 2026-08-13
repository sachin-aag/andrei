import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { auth } from "@/auth";
import { PostHogProvider } from "@/providers/posthog-provider";
import { getCustomerPack } from "@/lib/customers/packs";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export function generateMetadata(): Metadata {
  const { branding } = getCustomerPack();
  return {
    title: branding.documentReviewTitle,
    description: branding.documentReviewDescription,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const pack = getCustomerPack();

  return (
    <html
      lang="en"
      className={inter.variable}
      data-customer={pack.id}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans antialiased">
        <PostHogProvider
          userId={session?.user?.workspaceUserId}
          email={session?.user?.email}
          name={session?.user?.name}
        >
          {children}
          <Toaster
            position="bottom-right"
            theme="light"
            closeButton
            toastOptions={{
              style: {
                background: "var(--card)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
              },
            }}
          />
        </PostHogProvider>
      </body>
    </html>
  );
}
