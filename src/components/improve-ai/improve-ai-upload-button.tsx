"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Upload } from "lucide-react";
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

export function ImproveAiUploadButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [deviationNo, setDeviationNo] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a .docx file");
      return;
    }

    setUploading(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);
    if (deviationNo.trim()) form.append("deviationNo", deviationNo.trim());

    try {
      const res = await fetch("/api/improve-ai/upload", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        sessionId?: string;
        error?: string;
      };
      if (!res.ok || !data.sessionId) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setOpen(false);
      router.push(`/improve-ai/${encodeURIComponent(data.sessionId)}`);
      router.refresh();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Upload className="size-4" />
        Upload report
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-[var(--brand-500)]" />
              Upload for AI evaluation
            </DialogTitle>
            <DialogDescription>
              Import a Word investigation report (.docx). We will run criteria
              evaluation and open a feedback session for you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="improve-ai-deviation">Deviation number (optional)</Label>
              <Input
                id="improve-ai-deviation"
                value={deviationNo}
                onChange={(e) => setDeviationNo(e.target.value)}
                placeholder="Leave blank to use value from file"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="improve-ai-file">Word document</Label>
              <Input
                id="improve-ai-file"
                ref={fileRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              />
            </div>
            {error ? (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={uploading} onClick={handleUpload}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : null}
              Upload & evaluate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
