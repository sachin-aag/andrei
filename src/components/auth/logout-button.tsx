"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void signOut({ callbackUrl: "/login" })}
    >
      <LogOut className="size-4" aria-hidden="true" />
      Log out
    </Button>
  );
}
