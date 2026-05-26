import { Loader2 } from "lucide-react";

export default function EditReportLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--background)]">
      <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading report…
      </div>
    </div>
  );
}
