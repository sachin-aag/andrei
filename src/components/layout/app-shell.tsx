"use client";

import { useId, useState } from "react";
import {
  LogOut,
  FileText,
  Home,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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
  const [collapsed, setCollapsed] = useState(true);
  const mainId = useId();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/", label: "Reports", icon: FileText },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--background)]">
      <a
        href={`#${mainId}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-[var(--card)] focus:px-3 focus:py-2 focus:text-sm focus:shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      >
        Skip to main content
      </a>
      <aside
        aria-label="Primary navigation"
        style={{ viewTransitionName: "app-sidebar" }}
        className={cn(
          "shrink-0 border-r border-[var(--border)] bg-[var(--card)] flex flex-col transition-[width] duration-200 ease-in-out",
          collapsed ? "w-14" : "w-60"
        )}
      >
        <div className="border-b border-[var(--border)]">
          <div
            className={cn(
              "h-16 flex items-center gap-3",
              collapsed ? "px-2 justify-center" : "px-5"
            )}
          >
            <div className="size-9 rounded-lg bg-white p-1 flex items-center justify-center shrink-0">
              <Image
                src="/logo.png"
                width={28}
                height={28}
                alt="MJ Biopharm"
                className="object-contain"
                style={{ width: "auto", height: "auto" }}
              />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold leading-tight truncate">
                  M.J. Biopharm
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)] truncate">
                  Quality Investigations
                </span>
              </div>
            )}
          </div>

          <div
            className={cn(
              "pb-3",
              collapsed ? "px-2 flex justify-center" : "px-3"
            )}
          >
            <button
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((c) => !c)}
              className={cn(
                "flex items-center gap-2 rounded-md text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
                collapsed
                  ? "size-10 justify-center"
                  : "w-full px-3 py-2.5"
              )}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-5" />
              ) : (
                <>
                  <PanelLeftClose className="size-5" />
                  <span>Collapse</span>
                </>
              )}
            </button>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item, idx) => (
            <Link
              key={idx}
              href={item.href}
              aria-label={collapsed ? item.label : undefined}
              aria-current={pathname === item.href ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
                collapsed && "justify-center px-0",
                pathname === item.href
                  ? "bg-[var(--brand-700)] text-white"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              {!collapsed && item.label}
            </Link>
          ))}
          {!collapsed && (
            <>
              <Separator className="my-3" />
              <div className="px-3 py-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                  Reference
                </span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 text-xs text-[var(--muted-foreground)]">
                <BookOpen className="size-4" aria-hidden="true" />
                <span>SOP/DP/QA/008</span>
              </div>
            </>
          )}
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <div
            className={cn(
              "flex items-center gap-3 p-2 rounded-md bg-[var(--secondary)]",
              collapsed && "justify-center p-1"
            )}
          >
            <div className="size-8 rounded-full bg-[var(--brand-600)] flex items-center justify-center text-xs font-semibold shrink-0">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            {!collapsed && (
              <>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-medium truncate">
                    {user.name}
                  </span>
                  <span className="text-[10px] text-[var(--muted-foreground)] truncate">
                    {user.role === "engineer" ? "Engineer" : "Manager"} · ID{" "}
                    {user.employeeId}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Log out"
                  onClick={handleLogout}
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                  title="Log out"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      <main id={mainId} className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
}
