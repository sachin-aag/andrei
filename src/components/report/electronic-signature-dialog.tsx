"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SignatureMeaningUi = "submission" | "approval" | "rejection";

const MEANING_COPY: Record<
  SignatureMeaningUi,
  { title: string; description: string; confirm: string }
> = {
  submission: {
    title: "Sign & Submit Report",
    description:
      "Re-enter your user ID (email) and password to apply your electronic signature. This records who signed, when, and that you are submitting this investigation report for review.",
    confirm: "Sign & Submit",
  },
  approval: {
    title: "Sign & Approve Report",
    description:
      "Re-enter your user ID (email) and password to apply your electronic signature approving this investigation report.",
    confirm: "Sign & Approve",
  },
  rejection: {
    title: "Sign & Return Feedback",
    description:
      "Re-enter your user ID (email) and password to apply your electronic signature returning this report to the author for feedback.",
    confirm: "Sign & Return",
  },
};

export type SigningPayload = {
  userId: string;
  password: string;
};

type ElectronicSignatureDialogProps = {
  open: boolean;
  meaning: SignatureMeaningUi;
  defaultUserId?: string;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: SigningPayload) => void | Promise<void>;
};

export function ElectronicSignatureDialog({
  open,
  meaning,
  defaultUserId = "",
  loading = false,
  onOpenChange,
  onConfirm,
}: ElectronicSignatureDialogProps) {
  const [userId, setUserId] = useState(defaultUserId);
  const [password, setPassword] = useState("");
  const copy = MEANING_COPY[meaning];

  const handleConfirm = async () => {
    await onConfirm({ userId: userId.trim(), password });
    setPassword("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!loading) {
          onOpenChange(next);
          if (!next) setPassword("");
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="esign-user-id">User ID (email)</Label>
            <Input
              id="esign-user-id"
              type="email"
              autoComplete="username"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="esign-password">Password</Label>
            <Input
              id="esign-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading || !password || !userId.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Signing…
              </>
            ) : (
              copy.confirm
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
