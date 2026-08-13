"use client";

import { useState } from "react";
import { Folder } from "lucide-react";
import { useReportAttachments } from "@/providers/report-attachments-provider";
import type { FolderId } from "@/providers/report-attachments-provider";
import { indentStyle } from "./indent";

export function NewFolderRow({
  parentId,
  depth,
  onDone,
}: {
  parentId: FolderId;
  depth: number;
  onDone: () => void;
}) {
  const { createFolder } = useReportAttachments();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) {
      onDone();
      return;
    }
    setSaving(true);
    await createFolder(trimmed, parentId);
    setSaving(false);
    onDone();
  };

  return (
    <div
      className="flex items-center gap-1.5 rounded-md px-1 py-1"
      style={indentStyle(depth)}
    >
      <Folder className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
      <input
        autoFocus
        aria-label="Folder name"
        placeholder="New folder"
        value={name}
        disabled={saving}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") void commit();
          if (event.key === "Escape") onDone();
        }}
        className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      />
    </div>
  );
}
