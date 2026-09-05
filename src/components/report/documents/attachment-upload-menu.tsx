"use client";

import { useState } from "react";
import { Library, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddFromLibraryDialog } from "./add-from-library-dialog";

type Props = {
  disabled?: boolean;
  isAdmin?: boolean;
  onUploadClick: () => void;
  onLinkFromLibrary: (selection: {
    assetIds: string[];
    libraryFolderIds: string[];
    excludedAssetIds?: string[];
  }) => Promise<void>;
};

export function AttachmentUploadMenu({
  disabled = false,
  isAdmin = false,
  onUploadClick,
  onLinkFromLibrary,
}: Props) {
  const [libraryOpen, setLibraryOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Add attachment"
            title="Add attachment"
            disabled={disabled}
          >
            <Upload className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={onUploadClick}>
            <Upload className="size-4" aria-hidden="true" />
            Upload new
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLibraryOpen(true)}>
            <Library className="size-4" aria-hidden="true" />
            Add from vault
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddFromLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        isAdmin={isAdmin}
        onLink={onLinkFromLibrary}
      />
    </>
  );
}
