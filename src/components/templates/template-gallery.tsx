"use client";

import { useState } from "react";
import { ChevronDown, Factory, Package, PenTool, ShieldCheck } from "lucide-react";
import { CreateReportDialog } from "@/components/dashboard/create-report-button";
import { TemplateTile } from "@/components/templates/template-tile";
import { Button } from "@/components/ui/button";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import {
  BLANK_DOCUMENT_TEMPLATE,
  DEMO_TEMPLATE_SECTIONS,
  listedDemoTemplatesInSection,
  type DemoDocumentTemplate,
  type DemoTemplateSectionId,
} from "@/lib/document-templates";
import { cn } from "@/lib/utils";

const SECTION_ICONS = {
  supply_chain: Package,
  design: PenTool,
  operations: Factory,
  quality: ShieldCheck,
} as const;

export function TemplateGallery({
  managers,
}: {
  managers: Pick<WorkspaceUser, "id" | "name" | "title">[];
}) {
  const [openSection, setOpenSection] = useState<DemoTemplateSectionId | null>(
    "supply_chain"
  );
  const [selected, setSelected] = useState<DemoDocumentTemplate | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      {DEMO_TEMPLATE_SECTIONS.map((section) => {
        const Icon = SECTION_ICONS[section.id];
        const templates = listedDemoTemplatesInSection(section.id);
        const expanded = openSection === section.id;
        const panelId = `template-section-${section.id}`;
        return (
          <section
            key={section.id}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
          >
            <h2 className="sr-only">{section.title}</h2>
            <button
              type="button"
              aria-label={section.title}
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() =>
                setOpenSection((current) =>
                  current === section.id ? null : section.id
                )
              }
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-700)]">
                <Icon className="size-5 text-[var(--brand-200)]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold tracking-tight">
                  {section.title}
                </span>
                <span className="mt-0.5 block text-sm text-[var(--muted-foreground)]">
                  {section.subtitle}
                </span>
              </span>
              <span className="hidden text-xs text-[var(--muted-foreground)] sm:inline">
                {templates.length}{" "}
                {templates.length === 1 ? "template" : "templates"}
              </span>
              <ChevronDown
                className={cn(
                  "size-5 shrink-0 text-[var(--muted-foreground)] transition-transform",
                  expanded && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>
            {expanded ? (
              <div
                id={panelId}
                className="border-t border-[var(--border)] px-5 py-5"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {templates.map((template) => (
                    <TemplateTile
                      key={template.id}
                      template={template}
                      onSelect={setSelected}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}

      <div className="flex justify-end pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={() => setSelected(BLANK_DOCUMENT_TEMPLATE)}
        >
          Blank document
        </Button>
      </div>

      <CreateReportDialog
        key={selected?.id ?? "closed"}
        managers={managers}
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
        }}
        template={selected}
      />
    </div>
  );
}
