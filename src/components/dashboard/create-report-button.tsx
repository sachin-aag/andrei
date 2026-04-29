"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Plus, Loader2, X } from "lucide-react";
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
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const managers = getManagers();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setDeviationNo("");
    setManagerId("");
    setDraftFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = () => {
    if (!deviationNo.trim()) {
      toast.error("Deviation number is required");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("deviationNo", deviationNo.trim());
      fd.append("assignedManagerId", managerId || "");
      if (draftFile) fd.append("file", draftFile);

      const res = await fetch("/api/reports", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to create report");
        return;
      }
      const data = await res.json();
      setOpen(false);
      resetForm();
      toast.success("Report created");
      router.push(`/reports/${data.id}/edit`);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create investigation report</DialogTitle>
          <DialogDescription>
            Starts a new deviation investigation report as a draft. Optionally
            upload an existing Word document (.docx): content under headings named
            Define, Measure, Analyze, Improve, and Control is placed into those
            sections. If those headings are missing, the whole document opens in
            Define.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="report-upload">Existing report (.docx, optional)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="report-upload"
                ref={fileInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-[var(--secondary)] file:px-3 file:py-1 file:text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setDraftFile(f);
                }}
              />
              {draftFile && (
                <>
                  <span className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] max-w-[200px] truncate">
                    <FileText className="size-3.5 shrink-0" />
                    {draftFile.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-[var(--muted-foreground)]"
                    onClick={() => {
                      setDraftFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <X className="size-3.5" />
                    Clear
                  </Button>
                </>
              )}
            </div>
          </div>
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
