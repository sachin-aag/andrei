"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminUser } from "@/lib/admin/users";
import { USER_ROLES, roleLabel, type UserRole } from "@/lib/auth/roles";
import {
  passwordStrengthRequirementText,
  validatePasswordStrength,
} from "@/lib/auth/password-strength";

type CreateUserForm = {
  name: string;
  email: string;
  role: UserRole;
  temporaryPassword: string;
};

const emptyCreateForm: CreateUserForm = {
  name: "",
  email: "",
  role: "engineer",
  temporaryPassword: "",
};

function sortUsers(users: AdminUser[]): AdminUser[] {
  return [...users].sort((a, b) => a.name.localeCompare(b.name));
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? fallback;
}

export function AdminUsersPanel({
  initialUsers,
  currentUserId,
  initialPasswordExpiryDays,
}: {
  initialUsers: AdminUser[];
  currentUserId: string;
  initialPasswordExpiryDays: number;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(() => sortUsers(initialUsers));
  const [passwordExpiryDays, setPasswordExpiryDays] = useState(
    String(initialPasswordExpiryDays)
  );
  const [savedPasswordExpiryDays, setSavedPasswordExpiryDays] = useState(
    initialPasswordExpiryDays
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(emptyCreateForm);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [pendingRoleUserId, setPendingRoleUserId] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();
  const [isResetting, startResetTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isSavingExpiry, startExpirySaveTransition] = useTransition();

  const updateUser = (updated: AdminUser) => {
    setUsers((current) =>
      sortUsers(current.map((user) => (user.id === updated.id ? updated : user)))
    );
  };

  const removeUser = (userId: string) => {
    setUsers((current) => current.filter((user) => user.id !== userId));
  };

  const resetCreateForm = () => {
    setCreateForm(emptyCreateForm);
  };

  const createUser = () => {
    if (!createForm.email.trim()) {
      toast.error("Email is required");
      return;
    }
    const validation = validatePasswordStrength(createForm.temporaryPassword);
    if (!validation.ok) {
      toast.error(validation.errors.join(" "));
      return;
    }

    startCreateTransition(async () => {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name.trim() || undefined,
          email: createForm.email.trim(),
          role: createForm.role,
          temporaryPassword: createForm.temporaryPassword,
        }),
      });

      if (!response.ok) {
        toast.error(await readError(response, "Could not create user"));
        return;
      }

      const data = (await response.json()) as { user: AdminUser };
      setUsers((current) => sortUsers([...current, data.user]));
      toast.success("User created");
      setCreateOpen(false);
      resetCreateForm();
    });
  };

  const changeRole = (userId: string, role: UserRole) => {
    setPendingRoleUserId(userId);
    void fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readError(response, "Could not update role"));
        }
        return (await response.json()) as { user: AdminUser };
      })
      .then((data) => {
        updateUser(data.user);
        toast.success("Role updated");
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not update role");
      })
      .finally(() => {
        setPendingRoleUserId(null);
      });
  };

  const savePasswordExpiryDays = () => {
    const expiryDays = Number.parseInt(passwordExpiryDays, 10);
    if (!Number.isInteger(expiryDays) || expiryDays < 0 || expiryDays > 3650) {
      toast.error("Enter a whole number of days between 0 and 3650");
      return;
    }

    startExpirySaveTransition(async () => {
      const response = await fetch("/api/admin/password-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiryDays }),
      });

      if (!response.ok) {
        toast.error(await readError(response, "Could not update password expiry"));
        return;
      }

      const data = (await response.json()) as { expiryDays: number };
      setSavedPasswordExpiryDays(data.expiryDays);
      setPasswordExpiryDays(String(data.expiryDays));
      toast.success("Password expiry updated");
    });
  };

  const resetPassword = () => {
    if (!resetUser) return;

    startResetTransition(async () => {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(resetUser.id)}/reset-password`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        toast.error(await readError(response, "Could not send reset email"));
        return;
      }

      toast.success(`Password reset email sent to ${resetUser.email}`);
      setResetUser(null);
    });
  };

  const deleteSelectedUser = () => {
    if (!deleteUser) return;

    startDeleteTransition(async () => {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(deleteUser.id)}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        toast.error(await readError(response, "Could not delete user"));
        return;
      }

      removeUser(deleteUser.id);
      toast.success("User deleted");
      setDeleteUser(null);
      router.refresh();
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-10 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Create users with temporary passwords, edit roles, and send password
            reset emails.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              New User
            </Button>
          </DialogTrigger>
          <DialogContent
            onInteractOutside={(event) => {
              if (isCreating) event.preventDefault();
            }}
            onEscapeKeyDown={(event) => {
              if (isCreating) event.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
              <DialogDescription>
                Set a temporary password. The user must choose a new password
                after first sign-in.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="admin-user-name">Name</Label>
                <Input
                  id="admin-user-name"
                  value={createForm.name}
                  disabled={isCreating}
                  placeholder="Optional; defaults from email"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-user-email">Email</Label>
                <Input
                  id="admin-user-email"
                  type="email"
                  value={createForm.email}
                  disabled={isCreating}
                  placeholder="user@mjbiopharm.com"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-user-role">Role</Label>
                <Select
                  value={createForm.role}
                  disabled={isCreating}
                  onValueChange={(value) =>
                    setCreateForm((current) => ({
                      ...current,
                      role: value as UserRole,
                    }))
                  }
                >
                  <SelectTrigger id="admin-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-user-password">Temporary password</Label>
                <Input
                  id="admin-user-password"
                  type="password"
                  value={createForm.temporaryPassword}
                  disabled={isCreating}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      temporaryPassword: event.target.value,
                    }))
                  }
                />
                <p className="text-xs text-[var(--muted-foreground)]">
                  {passwordStrengthRequirementText()}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isCreating}
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" disabled={isCreating} onClick={createUser}>
                {isCreating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Create user
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-y-auto px-10 py-6">
        <section className="mb-6 max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-base font-semibold">Password expiry</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Number of days before a user must change their password. Set to 0 to
            disable expiry.
          </p>
          <div className="mt-4 flex items-end gap-3">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="password-expiry-days">Days</Label>
              <Input
                id="password-expiry-days"
                type="number"
                min={0}
                max={3650}
                inputMode="numeric"
                value={passwordExpiryDays}
                disabled={isSavingExpiry}
                onChange={(event) => setPasswordExpiryDays(event.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={
                isSavingExpiry ||
                Number.parseInt(passwordExpiryDays, 10) === savedPasswordExpiryDays
              }
              onClick={savePasswordExpiryDays}
            >
              {isSavingExpiry ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </section>

        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--secondary)] text-left">
              <tr>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Password</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-t border-[var(--border)] hover:bg-[var(--secondary)]/50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {user.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={user.role}
                      disabled={pendingRoleUserId === user.id}
                      onValueChange={(value) =>
                        changeRole(user.id, value as UserRole)
                      }
                    >
                      <SelectTrigger
                        className="h-8 w-32"
                        aria-label={`Change role for ${user.name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {USER_ROLES.map((role) => (
                          <SelectItem
                            key={role}
                            value={role}
                            disabled={user.id === currentUserId && role !== "admin"}
                          >
                            {roleLabel(role)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {user.hasPassword ? (
                      user.mustChangePassword ? (
                        "Must change password"
                      ) : (
                        "Password set"
                      )
                    ) : (
                      "Magic link only"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setResetUser(user)}
                      >
                        Send reset email
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-[var(--muted-foreground)] hover:bg-red-50 hover:text-red-600 disabled:hover:bg-transparent disabled:hover:text-[var(--muted-foreground)]"
                        disabled={user.id === currentUserId}
                        aria-label={`Delete user ${user.name}`}
                        title={
                          user.id === currentUserId
                            ? "You cannot delete your own account"
                            : "Delete user"
                        }
                        onClick={() => setDeleteUser(user)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={resetUser !== null}
        onOpenChange={(open) => {
          if (isResetting) return;
          if (!open) {
            setResetUser(null);
          }
        }}
      >
        <DialogContent
          onInteractOutside={(event) => {
            if (isResetting) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isResetting) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Send password reset email</DialogTitle>
            <DialogDescription>
              Send {resetUser?.name} a secure link to choose their own new
              password. The link expires in 1 hour.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isResetting}
              onClick={() => {
                setResetUser(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isResetting} onClick={resetPassword}>
              {isResetting && <Loader2 className="size-4 animate-spin" />}
              Send reset email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteUser !== null}
        onOpenChange={(open) => {
          if (isDeleting) return;
          if (!open) {
            setDeleteUser(null);
          }
        }}
      >
        <DialogContent
          onInteractOutside={(event) => {
            if (isDeleting) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isDeleting) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete user?</DialogTitle>
            <DialogDescription>
              This will remove {deleteUser?.name}&apos;s sign-in access. Existing
              reports and comments remain in the audit history. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => {
                setDeleteUser(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={deleteSelectedUser}
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
