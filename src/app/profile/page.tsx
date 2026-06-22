import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import {
  getPasswordPolicy,
  passwordPolicyRequirementText,
} from "@/lib/auth/password-policy";
import { roleLabel } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { ChangeOwnPasswordForm } from "@/components/auth/change-own-password-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [workspaceUsers, passwordStatus, policy] = await Promise.all([
    listWorkspaceUsers(),
    getPasswordStatusForUser(user.id),
    getPasswordPolicy(),
  ]);

  return (
    <AppShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
      inactivityTimeoutMinutes={policy.inactivityTimeoutMinutes}
    >
      <div className="flex h-full flex-col overflow-auto">
        <div className="border-b border-[var(--border)] px-10 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Manage your account details and password.
          </p>
        </div>

        <div className="grid max-w-4xl gap-6 px-10 py-6 lg:grid-cols-[1fr_1.2fr]">
          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">Account</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-[var(--muted-foreground)]">Name</dt>
                <dd className="font-medium">{user.name}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted-foreground)]">Email</dt>
                <dd className="font-medium">{user.email}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted-foreground)]">Role</dt>
                <dd className="font-medium">{roleLabel(user.role)}</dd>
              </div>
              {passwordStatus.expiresAt ? (
                <div>
                  <dt className="text-[var(--muted-foreground)]">
                    Password expiry
                  </dt>
                  <dd className="font-medium">
                    {passwordStatus.expired
                      ? "Expired"
                      : `${passwordStatus.daysRemaining} days remaining`}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-base font-semibold">Change password</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              You can update your own password at any time.
            </p>
            <div className="mt-5">
              <ChangeOwnPasswordForm
                minLength={policy.minLength}
                passwordRequirements={passwordPolicyRequirementText(policy)}
              />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
