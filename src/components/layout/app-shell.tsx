"use client";

import { LogOut, FileText, Home, BookOpen } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MockUser } from "@/lib/auth/mock-users";

export function AppShell({
  user,
  children,
}: {
  user: MockUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/", label: "Reports", icon: FileText },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--background)]">
      <aside className="w-60 shrink-0 border-r border-[var(--border)] bg-[var(--card)] flex flex-col">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-[var(--border)]">
          <div className="size-9 rounded-lg bg-white p-1 flex items-center justify-center shrink-0">
            <Image
              src="/logo.png"
              width={28}
              height={28}
              alt="MJ Biopharm"
              className="object-contain"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold leading-tight truncate">
              M.J. Biopharm
            </span>
            <span className="text-[10px] text-[var(--muted-foreground)] truncate">
              Quality Investigations
            </span>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item, idx) => (
            <Link
              key={idx}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                pathname === item.href
                  ? "bg-[var(--brand-700)] text-white"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
          <Separator className="my-3" />
          <div className="px-3 py-1">
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
              Reference
            </span>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 text-xs text-[var(--muted-foreground)]">
            <BookOpen className="size-4" />
            <span>SOP/DP/QA/008</span>
          </div>
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <div className="flex items-center gap-3 p-2 rounded-md bg-[var(--secondary)]">
            <div className="size-8 rounded-full bg-[var(--brand-600)] flex items-center justify-center text-xs font-semibold shrink-0">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-medium truncate">{user.name}</span>
              <span className="text-[10px] text-[var(--muted-foreground)] truncate">
                {user.role === "engineer" ? "Engineer" : "Manager"} · ID{" "}
                {user.employeeId}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              title="Log out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col">{children}</main>
    </div>
  );
}
