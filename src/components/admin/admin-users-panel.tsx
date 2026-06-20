"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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

function roleBadgeVariant(role: UserRole): "default" | "secondary" | "outline" {
  switch (role) {
    case "admin":
      return "default";
    case "manager":
      return "secondary";
    case "engineer":
      return "outline";
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? fallback;
}

export function AdminUsersPanel({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AdminUser[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(() => sortUsers(initialUsers));
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(emptyCreateForm);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [pendingRoleUserId, setPendingRoleUserId] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();
  const [isResetting, startResetTransition] = useTransition();

  const updateUser = (updated: AdminUser) => {
    setUsers((current) =>
      sortUsers(current.map((user) => (user.id === updated.id ? updated : user)))
    );
  };

  const resetCreateForm = () => {
    setCreateForm(emptyCreateForm);
  };

  const createUser = () => {
    if (!createForm.email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (createForm.temporaryPassword.length < 8) {
      toast.error("Temporary password must be at least 8 characters");
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

  const resetPassword = () => {
    if (!resetUser) return;
    if (temporaryPassword.length < 8) {
      toast.error("Temporary password must be at least 8 characters");
      return;
    }

    startResetTransition(async () => {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(resetUser.id)}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ temporaryPassword }),
        }
      );

      if (!response.ok) {
        toast.error(await readError(response, "Could not reset password"));
        return;
      }

      setUsers((current) =>
        current.map((user) =>
          user.id === resetUser.id
            ? { ...user, hasPassword: true, mustChangePassword: true }
            : user
        )
      );
      toast.success("Temporary password set");
      setResetUser(null);
      setTemporaryPassword("");
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-10 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Create workspace users, edit roles, and issue temporary passwords.
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
                The temporary password must be changed after first sign-in.
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
                    <div className="flex items-center gap-2">
                      <Badge variant={roleBadgeVariant(user.role)}>
                        {roleLabel(user.role)}
                      </Badge>
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
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {user.hasPassword ? (
                      user.mustChangePassword ? (
                        "Temporary password active"
                      ) : (
                        "Password set"
                      )
                    ) : (
                      "Magic link only"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setResetUser(user)}
                    >
                      Reset password
                    </Button>
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
            setTemporaryPassword("");
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
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a temporary password for {resetUser?.name}. They will be forced
              to choose a new password after signing in.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="admin-reset-password">Temporary password</Label>
            <Input
              id="admin-reset-password"
              type="password"
              value={temporaryPassword}
              disabled={isResetting}
              onChange={(event) => setTemporaryPassword(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isResetting}
              onClick={() => {
                setResetUser(null);
                setTemporaryPassword("");
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isResetting} onClick={resetPassword}>
              {isResetting && <Loader2 className="size-4 animate-spin" />}
              Set temporary password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
