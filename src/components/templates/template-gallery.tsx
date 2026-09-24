"use client";

import { useState } from "react";
import { Factory, Package, PenTool, ShieldCheck } from "lucide-react";
import { CreateReportDialog } from "@/components/dashboard/create-report-button";
import { TemplateTile } from "@/components/templates/template-tile";
import { Button } from "@/components/ui/button";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import {
  BLANK_DOCUMENT_TEMPLATE,
  DEMO_TEMPLATE_SECTIONS,
  listedDemoTemplatesInSection,
  type DemoDocumentTemplate,
} from "@/lib/document-templates";

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
  const [selected, setSelected] = useState<DemoDocumentTemplate | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      {DEMO_TEMPLATE_SECTIONS.map((section) => {
        const Icon = SECTION_ICONS[section.id];
        const templates = listedDemoTemplatesInSection(section.id);
        return (
          <section
            key={section.id}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
          >
            <div className="flex w-full items-center gap-4 px-5 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-700)]">
                <Icon className="size-5 text-[var(--brand-200)]" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold tracking-tight">
                  {section.title}
                </h2>
                <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                  {section.subtitle}
                </p>
              </div>
              <span className="hidden text-xs text-[var(--muted-foreground)] sm:inline">
                {templates.length}{" "}
                {templates.length === 1 ? "template" : "templates"}
              </span>
            </div>
            <div className="border-t border-[var(--border)] px-5 py-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {templates.map((template) => (
                  <TemplateTile
                    key={template.id}
                    template={template}
                    onSelect={setSelected}
                  />
                ))}
              </div>
            </div>
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
