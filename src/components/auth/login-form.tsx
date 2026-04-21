"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MockUser } from "@/lib/auth/mock-users";

export function LoginForm({ users }: { users: MockUser[] }) {
  const [selectedId, setSelectedId] = useState<string>(users[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-2">
        <Label>Select user</Label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="h-12">
            <SelectValue placeholder="Pick a user" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                <div className="flex flex-col py-1">
                  <span className="font-medium">
                    {u.name}{" "}
                    <span className="text-[var(--muted-foreground)] font-normal">
                      · {u.role === "engineer" ? "Engineer" : "Manager"}
                    </span>
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {u.title} · Emp #{u.employeeId}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <LogIn className="size-4" />
        )}
        Continue
      </Button>
      <p className="text-xs text-[var(--muted-foreground)] text-center">
        Mock authentication · no password required
      </p>
    </form>
  );
}
