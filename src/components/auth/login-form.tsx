"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Separator } from "@/components/ui/separator";
import type { MockUser, UserRole } from "@/lib/auth/mock-users";

const CREATE_USER_VALUE = "__create_user__";

export function LoginForm({ initialUsers }: { initialUsers: MockUser[] }) {
  const [users, setUsers] = useState<MockUser[]>(initialUsers);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [selectOpen, setSelectOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "engineer" as UserRole,
    title: "",
  });

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.title.toLowerCase().includes(q)
    );
  }, [users, search]);

  const canContinue = Boolean(selectedId);

  const submit = () => {
    if (!canContinue) return;
    startTransition(async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedId }),
      });
      if (!res.ok) return;
      window.location.href = "/";
    });
  };

  const createUser = async () => {
    const name = newUser.name.trim();
    const email = newUser.email.trim();
    if (!name || !email) {
      setCreateError("Name and email are required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          role: newUser.role,
          title: newUser.title.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { user?: MockUser; error?: string };
      if (!res.ok || !data.user) {
        setCreateError(data.error ?? "Could not add user.");
        return;
      }
      setUsers((prev) =>
        [...prev.filter((u) => u.id !== data.user!.id), data.user!].sort(
          (a, b) => a.name.localeCompare(b.name)
        )
      );
      setSelectedId(data.user.id);
      setNewUser({ name: "", email: "", role: "engineer", title: "" });
      setCreateOpen(false);
    } catch {
      setCreateError("Could not add user.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md gap-0 p-0 overflow-hidden [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-6 pt-6 pb-4 space-y-1 border-b border-[var(--border)] bg-[var(--secondary)]/40">
            <DialogTitle className="text-xl">Select user</DialogTitle>
            <DialogDescription>
              Choose your name to continue. Your work is saved under this
              identity.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="user-select">User</Label>
              <Select
                open={selectOpen}
                onOpenChange={(open) => {
                  setSelectOpen(open);
                  if (!open) {
                    setSearch("");
                    return;
                  }
                  requestAnimationFrame(() => searchInputRef.current?.focus());
                }}
                value={selectedId || undefined}
                onValueChange={(value) => {
                  if (value === CREATE_USER_VALUE) {
                    setSelectOpen(false);
                    setSearch("");
                    setCreateOpen(true);
                    return;
                  }
                  setSelectedId(value);
                  setSelectOpen(false);
                  setSearch("");
                }}
              >
                <SelectTrigger id="user-select" className="h-11">
                  <SelectValue placeholder="Select your name" />
                </SelectTrigger>
                <SelectContent className="max-h-80 p-0">
                  <div
                    className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--popover)] p-2"
                    onPointerDown={(e) => e.preventDefault()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                      <Input
                        ref={searchInputRef}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name or email"
                        className="h-9 pl-8"
                        autoComplete="off"
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1">
                    <SelectItem
                      value={CREATE_USER_VALUE}
                      className="text-[var(--brand-600)] font-medium"
                    >
                      <span className="flex items-center gap-2">
                        <UserPlus className="size-4" />
                        Add new user…
                      </span>
                    </SelectItem>
                    <Separator className="my-1" />
                    {filteredUsers.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
                        No users match your search.
                      </p>
                    ) : (
                      filteredUsers.map((user) => (
                        <SelectItem
                          key={user.id}
                          value={user.id}
                          className="py-2.5"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{user.name}</span>
                            <span className="text-xs text-[var(--muted-foreground)]">
                              {user.email} · {user.title}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-[var(--border)] bg-[var(--secondary)]/20">
            <Button
              type="button"
              className="w-full h-11"
              disabled={!canContinue || pending}
              onClick={submit}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add new user</DialogTitle>
            <DialogDescription>
              Add yourself or a colleague to the workspace roster. They can sign
              in immediately after you save.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-user-name">Full name</Label>
              <Input
                id="new-user-name"
                value={newUser.name}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. Jane Doe"
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                value={newUser.email}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="e.g. jane.doe@mjbiopharm.com"
                autoComplete="email"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-user-role">Role</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(value: UserRole) =>
                    setNewUser((prev) => ({ ...prev, role: value }))
                  }
                >
                  <SelectTrigger id="new-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="engineer">Engineer</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-title">Job title</Label>
                <Input
                  id="new-user-title"
                  value={newUser.title}
                  onChange={(e) =>
                    setNewUser((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Optional"
                  autoComplete="organization-title"
                />
              </div>
            </div>
            {createError ? (
              <p className="text-sm text-destructive" role="alert">
                {createError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={creating}
              onClick={() => void createUser()}
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : null}
              Save user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
