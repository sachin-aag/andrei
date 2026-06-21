import { compare, type Operation } from "fast-json-patch";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  sectionContentVersions,
  type SectionType,
} from "@/db/schema";
import type { AuditActorSnapshot } from "./actor";
import { hashSectionContent } from "./content-hash";
import { recordAuditEvent } from "./record-audit-event";

export const SECTION_VERSION_CHECKPOINT_INTERVAL = 20;

export type RecordSectionVersionInput = {
  actor: AuditActorSnapshot;
  reportId: string;
  sectionId: string;
  section: SectionType;
  previousContent: unknown;
  newContent: unknown;
  forceSnapshot?: boolean;
};

export async function recordSectionVersion(input: RecordSectionVersionInput) {
  const previousHash = hashSectionContent(input.previousContent);
  const newHash = hashSectionContent(input.newContent);
  if (previousHash === newHash) {
    return null;
  }

  const [latest] = await db
    .select()
    .from(sectionContentVersions)
    .where(
      and(
        eq(sectionContentVersions.reportId, input.reportId),
        eq(sectionContentVersions.section, input.section)
      )
    )
    .orderBy(desc(sectionContentVersions.versionNo))
    .limit(1);

  const versionNo = (latest?.versionNo ?? 0) + 1;
  const isFirstVersion = !latest;
  const shouldSnapshot =
    input.forceSnapshot ||
    isFirstVersion ||
    versionNo % SECTION_VERSION_CHECKPOINT_INTERVAL === 0;

  let diff: Operation[] | null = null;
  if (!isFirstVersion && !shouldSnapshot) {
    diff = compare(
      (input.previousContent ?? {}) as object,
      (input.newContent ?? {}) as object
    );
    if (diff.length === 0) {
      return null;
    }
  }

  const auditEvent = await recordAuditEvent({
    actor: input.actor,
    action: "section_updated",
    entityType: "section",
    entityId: input.sectionId,
    reportId: input.reportId,
    summary: `Updated ${input.section} section (v${versionNo})`,
    oldValue: { contentHash: previousHash },
    newValue: { contentHash: newHash, versionNo },
    metadata: { section: input.section },
  });

  const [version] = await db
    .insert(sectionContentVersions)
    .values({
      reportId: input.reportId,
      section: input.section,
      versionNo,
      isSnapshot: shouldSnapshot,
      contentSnapshot: shouldSnapshot
        ? (input.newContent as Record<string, unknown>)
        : null,
      diff: shouldSnapshot ? null : (diff as unknown as Record<string, unknown>[]),
      contentHash: newHash,
      auditEventId: auditEvent.id,
    })
    .returning();

  return { version, auditEvent };
}

export async function checkpointAllSectionsForReport(reportId: string) {
  const rows = await db
    .select()
    .from(sectionContentVersions)
    .where(eq(sectionContentVersions.reportId, reportId))
    .orderBy(desc(sectionContentVersions.versionNo));

  const latestBySection = new Map<SectionType, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestBySection.has(row.section)) {
      latestBySection.set(row.section, row);
    }
  }

  for (const row of latestBySection.values()) {
    if (row.isSnapshot) continue;
    const content = await reconstructSectionContent(
      reportId,
      row.section,
      row.versionNo
    );
    const versionNo = row.versionNo + 1;
    const auditEvent = await recordAuditEvent({
      actor: { id: "system", name: "System", role: "system" },
      action: "section_updated",
      entityType: "section",
      entityId: `${reportId}:${row.section}`,
      reportId,
      summary: `Signature checkpoint snapshot for ${row.section} (v${versionNo})`,
      newValue: { contentHash: hashSectionContent(content), versionNo },
      metadata: { section: row.section, checkpoint: true },
    });

    await db.insert(sectionContentVersions).values({
      reportId,
      section: row.section,
      versionNo,
      isSnapshot: true,
      contentSnapshot: content as Record<string, unknown>,
      diff: null,
      contentHash: hashSectionContent(content),
      auditEventId: auditEvent.id,
    });
  }
}

async function reconstructSectionContent(
  reportId: string,
  section: SectionType,
  targetVersionNo: number
): Promise<unknown> {
  const { reconstructSectionAtVersion } = await import("./reconstruct-section");
  return reconstructSectionAtVersion(reportId, section, targetVersionNo);
}
