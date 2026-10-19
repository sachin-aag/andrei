"use client";

import type { DocumentType } from "@/db/schema";
import { ReportViewOnlyOverride } from "@/providers/report-provider";
import { cn } from "@/lib/utils";
import { CanvasTabPane } from "./canvas-tab-pane";
import { LazyWorkspaceSection } from "./lazy-workspace-section";
import { ReportHeader } from "./report-header";
import { ReportWorkspaceLoading } from "./report-workspace-loading";
import { WorkProductViewOnlyBanner } from "./work-product-view-only-banner";
import type { SectionEditorMap } from "./section-editor-loaders";
import {
  documentCanvasWidthClass,
  documentColumnStyle,
} from "./workspace-layout";

/**
 * Split-pane copy of the live report. Looks like the document (identity,
 * tables, sections) but does not register editors or autosave.
 */
export function ReportDocumentReplica({
  paneId,
  active,
  editorsAllowed,
  workspaceSectionList,
  sectionEditors,
  documentType,
  continuousDocument,
  documentWidth,
}: {
  paneId: string;
  active: boolean;
  editorsAllowed: boolean;
  workspaceSectionList: readonly { key: string; label: string }[];
  sectionEditors: SectionEditorMap | null | undefined;
  documentType: DocumentType;
  continuousDocument: boolean;
  documentWidth: number;
}) {
  return (
    <CanvasTabPane
      active={active}
      scrollable
      scrollTabId={`${paneId}-report`}
      testId={`${paneId}-report-document-canvas`}
      header={<WorkProductViewOnlyBanner product="Report" />}
    >
      <ReportViewOnlyOverride>
        <div
          className={cn(
            "mx-auto grid w-full min-w-0 grid-cols-1 gap-8 pb-24",
            documentCanvasWidthClass({
              continuousDocument,
              reviewGutterVisible: false,
            })
          )}
          style={
            continuousDocument ? undefined : documentColumnStyle(documentWidth)
          }
        >
          <div
            id={`${paneId}-report-document-sheet`}
            className={cn(
              "relative space-y-10 min-w-0",
              documentType === "quality_risk_assessment" && "qra-document"
            )}
          >
            <ReportHeader />
            <div
              className={cn(
                "min-w-0",
                continuousDocument ? "space-y-4" : "space-y-10"
              )}
            >
              {editorsAllowed ? (
                workspaceSectionList.map((section, index) => {
                  const Editor = sectionEditors?.[section.key];
                  if (!Editor) return null;
                  return (
                    <LazyWorkspaceSection
                      key={section.key}
                      id={`${paneId}-${section.key}`}
                      title={section.label}
                      eager={index < 1}
                    >
                      <Editor />
                    </LazyWorkspaceSection>
                  );
                })
              ) : (
                <ReportWorkspaceLoading />
              )}
            </div>
          </div>
        </div>
      </ReportViewOnlyOverride>
    </CanvasTabPane>
  );
}
