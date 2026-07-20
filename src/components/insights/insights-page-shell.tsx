import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export async function InsightsPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin/reports");

  const [workspaceUsers, passwordStatus, policy] = await Promise.all([
    listWorkspaceUsers(),
    getPasswordStatusForUser(user.id),
    getPasswordPolicy(),
  ]);

  const tabs = [
    { href: "/insights/dashboard", label: "PM Dashboard" },
    { href: "/insights/pitfalls", label: "Common Pitfalls" },
    { href: "/insights/doc-insights", label: "Doc Insights" },
    { href: "/insights/management", label: "Management Report" },
  ];

  return (
    <AppShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
      inactivityTimeoutMinutes={policy.inactivityTimeoutMinutes}
    >
      <div className="flex h-full flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
          <h1 className="text-xl font-semibold text-[var(--foreground)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Insights sections">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--secondary)]"
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </header>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </AppShell>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold text-[var(--brand-700)]">{value}</p>
        {hint ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function BarChart({
  items,
}: {
  items: Array<{ label: string; value: number; color?: string }>;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{item.label}</span>
            <span className="text-[var(--muted-foreground)]">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--secondary)]">
            <div
              className="h-2 rounded-full"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color ?? "var(--brand-500)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({
  segments,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  // Precompute each segment's arc length and cumulative offset so the render
  // stays a pure map (no mutation after render completes).
  let cumulative = 0;
  const arcs = segments.map((segment) => {
    const length = (segment.value / total) * circumference;
    const offset = cumulative;
    cumulative += length;
    return { segment, length, offset };
  });

  return (
    <div className="flex items-center gap-6">
      <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Status distribution">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--secondary)" strokeWidth="16" />
        {arcs.map(({ segment, length, offset }) => (
          <circle
            key={segment.label}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth="16"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          />
        ))}
      </svg>
      <ul className="space-y-1 text-sm">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            {segment.label}: {segment.value}
          </li>
        ))}
      </ul>
    </div>
  );
}
