"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { getManagers } from "@/lib/auth/mock-users";

export function CreateReportButton() {
  const [open, setOpen] = useState(false);
  const [deviationNo, setDeviationNo] = useState("");
  const [managerId, setManagerId] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const managers = getManagers();

  const submit = () => {
    if (!deviationNo.trim()) {
      toast.error("Deviation number is required");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviationNo: deviationNo.trim(),
          assignedManagerId: managerId || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to create report");
        return;
      }
      const data = await res.json();
      setOpen(false);
      setDeviationNo("");
      setManagerId("");
      toast.success("Report created");
      router.push(`/reports/${data.id}/edit`);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create investigation report</DialogTitle>
          <DialogDescription>
            Starts a new deviation investigation report as a draft. You can edit
            details later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="deviationNo">Deviation Number</Label>
            <Input
              id="deviationNo"
              placeholder="e.g. DEV/PK/26/001"
              value={deviationNo}
              onChange={(e) => setDeviationNo(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Assigned Manager (optional)</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a manager" />
              </SelectTrigger>
              <SelectContent>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} · {m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
