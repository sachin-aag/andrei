import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { auth } from "@/auth";
import { PostHogProvider } from "@/providers/posthog-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Andrei — Document Review",
  description:
    "AI document review and drafting for regulated quality teams",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
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
