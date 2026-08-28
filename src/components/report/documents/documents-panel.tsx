"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FolderPlus,
  ListTree,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildDocumentTree } from "@/lib/attachments/build-tree";
import { ATTACHMENT_ACCEPT_ATTR } from "@/lib/attachments/file-types";
import { warmupPdfjsPreview } from "@/lib/attachments/load-pdfjs";
import { useReportAttachments } from "@/providers/report-attachments-provider";
import type { DocumentType, SectionType } from "@/db/schema";
import { getReportTableOfContents } from "@/lib/document-types/convergent/table-of-contents";
import { DocumentTreeNodes } from "./document-tree";
import { DragProvider, useDocumentDrag } from "./drag-context";
import { NewFolderRow } from "./new-folder-row";
import { TableOfContentsPanel } from "./table-of-contents-panel";

export type LeftPanelTab = "attachments" | "contents";

type Props = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  documentType: DocumentType;
  onJumpToSection: (section: SectionType) => void;
};

const LEFT_PANEL_TABS: {
  value: LeftPanelTab;
  label: string;
  icon: typeof Paperclip;
}[] = [
  { value: "attachments", label: "Attachments", icon: Paperclip },
  { value: "contents", label: "Contents", icon: ListTree },
];

/**
 * Report-scoped left rail: attachments tree, and (Convergent DV only) a table of
 * contents that mirrors the Word export hierarchy.
 */
export function DocumentsPanel({
  collapsed,
  onToggleCollapse,
  documentType,
  onJumpToSection,
}: Props) {
  const { attachments } = useReportAttachments();
  const tableOfContents = useMemo(
    () => getReportTableOfContents(documentType),
    [documentType]
  );
  const showContentsTab = tableOfContents != null;
  const [activeTab, setActiveTab] = useState<LeftPanelTab>("attachments");

  useEffect(() => {
    warmupPdfjsPreview({ whenIdle: true });
  }, []);

  useEffect(() => {
    if (!showContentsTab && activeTab === "contents") {
      setActiveTab("attachments");
    }
  }, [showContentsTab, activeTab]);

  if (collapsed) {
    return (
      <aside
        id="report-documents-panel"
        aria-label="Documents"
        className="relative flex h-full w-full min-w-0 flex-col items-center border-r border-[var(--border)] bg-[var(--card)] py-2"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand documents"
          aria-expanded={false}
          title="Documents"
          className="relative flex size-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        >
          <Paperclip className="size-4" aria-hidden="true" />
          {attachments.length > 0 ? (
            <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
              {attachments.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand documents panel"
          className="mt-1 flex size-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
          title="Expand"
        >
          <PanelLeftOpen className="size-4" aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return (
    <DragProvider>
      <ExpandedDocumentsPanel
        onToggleCollapse={onToggleCollapse}
        showContentsTab={showContentsTab}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tableOfContents={tableOfContents}
        onJumpToSection={onJumpToSection}
      />
    </DragProvider>
  );
}

function ExpandedDocumentsPanel({
  onToggleCollapse,
  showContentsTab,
  activeTab,
  onTabChange,
  tableOfContents,
  onJumpToSection,
}: {
  onToggleCollapse: () => void;
  showContentsTab: boolean;
  activeTab: LeftPanelTab;
  onTabChange: (tab: LeftPanelTab) => void;
  tableOfContents: ReturnType<typeof getReportTableOfContents>;
  onJumpToSection: (section: SectionType) => void;
}) {
  const { attachments, folders, canMutateAttachments, uploadFiles } =
    useReportAttachments();
  const { dragging, endDrag } = useDocumentDrag();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [rootDropActive, setRootDropActive] = useState(false);

  const tree = useMemo(
    () => buildDocumentTree(folders, attachments),
    [folders, attachments]
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setIsUploading(true);
      try {
        await uploadFiles(files, null);
      } finally {
        setIsUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [uploadFiles]
  );

  const isEmpty = tree.folders.length === 0 && tree.attachments.length === 0;
  const visibleTabs = showContentsTab
    ? LEFT_PANEL_TABS
    : LEFT_PANEL_TABS.filter((tab) => tab.value === "attachments");

  return (
    <aside
      id="report-documents-panel"
      aria-label="Documents"
      className="flex h-full w-full min-w-0 flex-col border-r border-[var(--border)] bg-[var(--card)]"
    >
      <div className="flex items-center justify-between gap-1 border-b border-[var(--border)] px-3 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <Paperclip
            className="size-4 text-[var(--muted-foreground)]"
            aria-hidden="true"
          />
          Documents
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Collapse documents panel"
          aria-expanded
          title="Collapse"
          onClick={onToggleCollapse}
        >
          <PanelLeftClose className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {showContentsTab ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--border)] px-2 py-1.5">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => onTabChange(tab.value)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  selected
                    ? "bg-[var(--secondary)] text-[var(--foreground)] border-[var(--border)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/50 border-transparent hover:border-[var(--border)]"
                )}
                aria-label={tab.label}
                aria-pressed={selected}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {activeTab === "contents" && tableOfContents ? (
        <TableOfContentsPanel
          entries={tableOfContents}
          onJumpToSection={onJumpToSection}
        />
      ) : (
        <>
          <div className="flex items-center justify-end gap-0.5 border-b border-[var(--border)] px-2 py-1.5">
            {canMutateAttachments ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="New folder"
                  title="New folder"
                  onClick={() => setCreatingFolder(true)}
                >
                  <FolderPlus className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Upload PDF or Word document"
                  title="Upload PDF or Word document"
                  disabled={isUploading}
                  onClick={() => inputRef.current?.click()}
                >
                  {isUploading ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="size-4" aria-hidden="true" />
                  )}
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ATTACHMENT_ACCEPT_ATTR}
                  multiple
                  className="hidden"
                  onChange={(event) => void handleFiles(event.target.files)}
                />
              </>
            ) : null}
          </div>

          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto p-2",
              rootDropActive && "bg-[var(--secondary)]/60"
            )}
            onDragOver={(event) => {
              if (!canMutateAttachments) return;
              event.preventDefault();
              setRootDropActive(true);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                return;
              }
              setRootDropActive(false);
            }}
            onDrop={(event) => {
              if (!canMutateAttachments) return;
              event.preventDefault();
              setRootDropActive(false);
              if (event.dataTransfer.files.length > 0) {
                void handleFiles(event.dataTransfer.files);
                return;
              }
              void endDrag(null);
            }}
          >
            {creatingFolder ? (
              <NewFolderRow
                parentId={null}
                depth={0}
                onDone={() => setCreatingFolder(false)}
              />
            ) : null}

            <DocumentTreeNodes
              folders={tree.folders}
              attachments={tree.attachments}
              depth={0}
            />

            {isEmpty && !creatingFolder ? (
              <p className="px-2 py-6 text-center text-xs text-[var(--muted-foreground)]">
                {canMutateAttachments
                  ? "Drop PDFs or Word docs here or use the upload button."
                  : "No documents have been attached yet."}
              </p>
            ) : null}
          </div>

          {dragging ? (
            <p className="border-t border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--muted-foreground)]">
              Drop on a folder to move, or here for the top level.
            </p>
          ) : null}
        </>
      )}
    </aside>
  );
}
