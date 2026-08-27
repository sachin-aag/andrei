import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  pgEnum,
  boolean,
  integer,
  bigint,
  real,
  uniqueIndex,
  index,
  primaryKey,
  customType,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

/** Postgres bytea column mapped to Node.js Buffer. */
export const bytea = customType<{ data: Buffer; driverData: string }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): string {
    return `\\x${value.toString("hex")}`;
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (typeof value === "string") {
      const hex = value.startsWith("\\x") ? value.slice(2) : value;
      return Buffer.from(hex, "hex");
    }
    throw new Error("Unexpected bytea value from driver");
  },
});

export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const reportStatusEnum = pgEnum("report_status", [
  "draft",
  "submitted",
  "in_review",
  "feedback",
  "approved",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "investigation_report",
  "design_verification",
  "mechanical_design_verification",
  "generic_document",
  "quality_risk_assessment",
]);

/**
 * Section keys are free text validated by the document-type registry.
 * Kept as a const for investigation_report so existing typed code compiles
 * during the multi-type transition; new document types add their own keys.
 */
export const INVESTIGATION_SECTION_TYPES = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
  "conclusion",
  "documents_reviewed",
  "attachments",
  "signature_approvals",
] as const;

/** @deprecated Prefer registry validation; retained for investigation typed editors. */
export const sectionTypeEnum = {
  enumValues: INVESTIGATION_SECTION_TYPES,
} as const;

export const criterionStatusEnum = pgEnum("criterion_status", [
  "met",
  "partially_met",
  "not_met",
  "not_evaluated",
]);

export const commentStatusEnum = pgEnum("comment_status", [
  "open",
  "resolved",
  "dismissed",
]);

/**
 * Discriminator for who/what created the comment. Reserved AI values land
 * here as the suggestion catalog grows (grammar, tone, removal, redraft) so
 * the schema does not need another migration per type.
 */
export const commentKindEnum = pgEnum("comment_kind", [
  "human",
  "word_import",
  "ai_fix",
  "ai_grammar",
  "ai_tone",
  "ai_removal",
  "ai_redraft",
]);

export const aiFeedbackSourceTypeEnum = pgEnum("ai_feedback_source_type", [
  "existing_report",
  "uploaded_docx",
]);

export const chatMessageRoleEnum = pgEnum("chat_message_role", [
  "user",
  "assistant",
]);

/** In-flight assistant generation for a chat session (survives tab close). */
export const chatAssistantTurnStatusEnum = pgEnum(
  "chat_assistant_turn_status",
  ["idle", "running", "cancel_requested"]
);

export const aiFeedbackSessionStatusEnum = pgEnum("ai_feedback_session_status", [
  "evaluating",
  "ready_for_review",
  "reviewed",
]);

export const userRoleEnum = pgEnum("user_role", [
  "engineer",
  "manager",
  "admin",
  "qa",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "report_created",
  "report_updated",
  "report_deleted",
  "report_submitted",
  "report_approved",
  "report_feedback",
  "section_updated",
  "comment_created",
  "comment_updated",
  "comment_status_changed",
  "comment_deleted",
  "suggestion_generated",
  "suggestion_applied",
  "evaluation_run",
  "evaluation_bypassed",
  "signature_submission",
  "signature_approval",
  "signature_rejection",
  "user_created",
  "user_updated",
  "user_password_reset",
  "policy_updated",
  "auth_password_changed",
  "auth_password_reset",
  "improve_ai_session_created",
  "improve_ai_session_completed",
  "improve_ai_response_updated",
  "report_purged",
  "user_deactivated",
  "user_reactivated",
  "user_unlocked",
  "attachment_uploaded",
  "attachment_deleted",
  "attachment_reprocessed",
]);

export const auditEntityEnum = pgEnum("audit_entity", [
  "report",
  "section",
  "comment",
  "suggestion",
  "evaluation",
  "signature",
  "user",
  "policy",
  "auth",
  "improve_ai",
  "attachment",
]);

export const attachmentProcessingStatusEnum = pgEnum(
  "attachment_processing_status",
  ["uploading", "validating", "queued", "processing", "ready", "failed"]
);

export const attachmentIngestRunStatusEnum = pgEnum(
  "attachment_ingest_run_status",
  ["pending", "running", "ready", "failed", "superseded", "cancelled"]
);

export const documentIngestBatchStatusEnum = pgEnum(
  "document_ingest_batch_status",
  ["pending", "running", "ready", "failed", "skipped"]
);

export const documentChunkSourceKindEnum = pgEnum(
  "document_chunk_source_kind",
  ["quote", "visual_interpretation"]
);

export const storageOutboxStatusEnum = pgEnum("storage_outbox_status", [
  "pending",
  "processing",
  "done",
  "failed",
]);

export const signatureMeaningEnum = pgEnum("signature_meaning", [
  "submission",
  "approval",
  "rejection",
]);

export const workspaceUsers = pgTable(
  "workspace_users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull().default("engineer"),
    title: text("title").notNull().default("Engineer"),
    /** Nullable — null means magic-link-only user. Format: hex_salt.hex_hash (scrypt). */
    passwordHash: text("password_hash"),
    /** True when a temporary password is active; user must choose a new one on next login. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    /** Set whenever a real password is created or changed. Null for passwordless users. */
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    /** Non-null means the account is locked until reset/admin password replacement. */
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    passwordExpiryWarningDismissedUntil: timestamp(
      "password_expiry_warning_dismissed_until",
      { withTimezone: true }
    ),
    /** Recent password hashes, newest first. Index 0 matches password_hash. Max length = policy limit. */
    passwordHistory: text("password_history")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** SHA-256 hash of the active password-reset token, if any. */
    passwordResetTokenHash: text("password_reset_token_hash"),
    passwordResetTokenExpiresAt: timestamp("password_reset_token_expires_at", {
      withTimezone: true,
    }),
    /** Non-null means the account is deactivated and cannot sign in until reactivated. */
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex("workspace_users_email_unique").on(t.email),
  })
);

export const passwordPolicySettings = pgTable("password_policy_settings", {
  id: text("id").primaryKey().default("default"),
  expiryDays: integer("expiry_days").notNull().default(90),
  inactivityTimeoutMinutes: integer("inactivity_timeout_minutes")
    .notNull()
    .default(10),
  warningDays: integer("warning_days").notNull().default(14),
  failedLoginAttemptLimit: integer("failed_login_attempt_limit")
    .notNull()
    .default(3),
  passwordHistoryLimit: integer("password_history_limit").notNull().default(3),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type InvestigationReportMetadata = {
  toolsUsed: { sixM: boolean; fiveWhy: boolean; brainstorming: boolean };
  otherTools: string;
};

export type DesignVerificationMetadata = {
  revision: string;
  productName: string;
};

export type GenericDocumentMetadata = {
  importWarnings?: string[];
  importedFromFilename?: string;
};

export type ReportMetadata =
  | InvestigationReportMetadata
  | DesignVerificationMetadata
  | GenericDocumentMetadata
  | Record<string, unknown>;

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    documentType: documentTypeEnum("document_type")
      .notNull()
      .default("investigation_report"),
    documentNo: text("document_no").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata")
      .$type<ReportMetadata>()
      .notNull()
      .default({}),
    status: reportStatusEnum("status").notNull().default("draft"),
    authorId: text("author_id").notNull(),
    assignedManagerId: text("assigned_manager_id"),
    /** Manager who first reviewed (first comment / in_review actor) for segregation of duties. */
    reviewedById: text("reviewed_by_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedById: text("deleted_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    documentNoUnique: uniqueIndex("reports_document_no_unique").on(
      t.authorId,
      t.documentType,
      t.documentNo
    ),
    deletedAtIdx: index("reports_deleted_at_idx").on(t.deletedAt),
  })
);

export const reportManagers = pgTable(
  "report_managers",
  {
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    managerId: text("manager_id")
      .notNull()
      .references(() => workspaceUsers.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.reportId, t.managerId] }),
    managerIdx: index("report_managers_manager_idx").on(t.managerId),
  })
);

export const reportSections = pgTable(
  "report_sections",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    content: jsonb("content").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueSection: uniqueIndex("report_section_unique").on(t.reportId, t.section),
  })
);

/** Original .docx uploaded at report creation (audit/backup; not loaded on list/get). */
export const reportSourceDocx = pgTable("report_source_docx", {
  reportId: text("report_id")
    .primaryKey()
    .references(() => reports.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default(DOCX_MIME_TYPE),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  data: bytea("data").notNull(),
  uploadedById: text("uploaded_by_id").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const criteriaEvaluations = pgTable("criteria_evaluations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reportId: text("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  sectionId: text("section_id")
    .notNull()
    .references(() => reportSections.id, { onDelete: "cascade" }),
  section: text("section").notNull(),
  criterionKey: text("criterion_key").notNull(),
  criterionLabel: text("criterion_label").notNull(),
  status: criterionStatusEnum("status").notNull().default("not_evaluated"),
  reasoning: text("reasoning").notNull().default(""),
  bypassed: boolean("bypassed").notNull().default(false),
  /**
   * Stable hash of the section content that produced this row. Used by the
   * /evaluate route to skip the LLM call when the section content has not
   * changed since the last evaluation (auto-eval dedupe).
   */
  evaluatedContentHash: text("evaluated_content_hash").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reportId: text("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  /** Reply thread: null = top-level (anchored) comment */
  parentId: text("parent_id").references((): AnyPgColumn => comments.id, {
    onDelete: "cascade",
  }),
  sectionId: text("section_id").references(() => reportSections.id, {
    onDelete: "cascade",
  }),
  section: text("section"),
  authorId: text("author_id").notNull(),
  content: text("content").notNull(),
  anchorText: text("anchor_text").notNull().default(""),
  contentPath: text("content_path"),
  fromPos: integer("from_pos"),
  toPos: integer("to_pos"),
  status: commentStatusEnum("status").notNull().default("open"),
  kind: commentKindEnum("kind").notNull().default("human"),
  source: text("source").notNull().default("app"),
  externalAuthorName: text("external_author_name"),
  externalAuthorInitials: text("external_author_initials"),
  externalCommentId: text("external_comment_id"),
  externalCreatedAt: timestamp("external_created_at", { withTimezone: true }),
  locked: boolean("locked").notNull().default(false),
  /** Links AI-generated comments to the criteria evaluation that emitted them. */
  evaluationId: text("evaluation_id").references(
    (): AnyPgColumn => criteriaEvaluations.id,
    { onDelete: "set null" }
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reportsRelations = relations(reports, ({ one, many }) => ({
  sections: many(reportSections),
  evaluations: many(criteriaEvaluations),
  comments: many(comments),
  sourceDocx: one(reportSourceDocx),
  managers: many(reportManagers),
  attachments: many(reportAttachments),
  analytics: one(statisticalWorkspaces),
}));

export const reportManagersRelations = relations(reportManagers, ({ one }) => ({
  report: one(reports, {
    fields: [reportManagers.reportId],
    references: [reports.id],
  }),
  manager: one(workspaceUsers, {
    fields: [reportManagers.managerId],
    references: [workspaceUsers.id],
  }),
}));

export const reportSourceDocxRelations = relations(reportSourceDocx, ({ one }) => ({
  report: one(reports, {
    fields: [reportSourceDocx.reportId],
    references: [reports.id],
  }),
}));

/**
 * User-defined folders for organising a report's PDF evidence. Purely
 * organisational: deleting a folder never deletes attachments (see the folder
 * DELETE route, which reparents children first).
 */
export const reportAttachmentFolders = pgTable(
  "report_attachment_folders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    /** Null = top level of the report's document tree. */
    parentId: text("parent_id").references(
      (): AnyPgColumn => reportAttachmentFolders.id,
      { onDelete: "cascade" }
    ),
    name: text("name").notNull(),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportIdx: index("report_attachment_folders_report_idx").on(t.reportId),
    parentIdx: index("report_attachment_folders_parent_idx").on(t.parentId),
  })
);

/**
 * PDF evidence attachments. Source bytes live in GCS; only metadata and
 * integrity fields are stored here. Soft-deleted rows retain bytes for audit.
 */
export const reportAttachments = pgTable(
  "report_attachments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    /** Null = top level of the report's document tree. */
    folderId: text("folder_id").references(() => reportAttachmentFolders.id, {
      onDelete: "set null",
    }),
    filename: text("filename").notNull(),
    /**
     * Optional user-authored note (2–3 lines) describing why this file matters.
     * Surfaced in AI chat document context; not embedded into chunk text.
     */
    description: text("description"),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** Server-computed SHA-256 of source bytes; empty until finalize. */
    sha256: text("sha256").notNull().default(""),
    stagingObjectKey: text("staging_object_key").notNull(),
    permanentObjectKey: text("permanent_object_key").notNull(),
    /** Exact GCS object generation after promotion; null while staging. */
    gcsGeneration: text("gcs_generation"),
    /** Base64 CRC32C from GCS metadata after verification. */
    crc32c: text("crc32c"),
    pageCount: integer("page_count"),
    processingStatus: attachmentProcessingStatusEnum("processing_status")
      .notNull()
      .default("uploading"),
    processingProgress: integer("processing_progress").notNull().default(0),
    /** 1-based page currently being extracted; null when idle. */
    processingPage: integer("processing_page"),
    processingError: text("processing_error"),
    /** Active completed ingest run; FK added in migration to avoid circular create. */
    activeIngestRunId: text("active_ingest_run_id"),
    uploadedById: text("uploaded_by_id").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedById: text("deleted_by_id"),
  },
  (t) => ({
    reportIdIdx: index("report_attachments_report_id_idx").on(t.reportId),
    reportActiveIdx: index("report_attachments_report_active_idx").on(
      t.reportId,
      t.deletedAt
    ),
    folderIdx: index("report_attachments_folder_idx").on(t.folderId),
  })
);

export const attachmentIngestRuns = pgTable(
  "attachment_ingest_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    attachmentId: text("attachment_id")
      .notNull()
      .references(() => reportAttachments.id, { onDelete: "cascade" }),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    status: attachmentIngestRunStatusEnum("status").notNull().default("pending"),
    parserVersion: text("parser_version").notNull(),
    extractModelId: text("extract_model_id").notNull(),
    extractPromptVersion: text("extract_prompt_version").notNull(),
    embeddingModelId: text("embedding_model_id").notNull(),
    embeddingDimensions: integer("embedding_dimensions").notNull().default(768),
    sourceGeneration: text("source_generation").notNull(),
    pageCount: integer("page_count"),
    batchCount: integer("batch_count"),
    completedBatchCount: integer("completed_batch_count").notNull().default(0),
    documentSummary: text("document_summary"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    attachmentIdx: index("attachment_ingest_runs_attachment_idx").on(
      t.attachmentId
    ),
    reportIdx: index("attachment_ingest_runs_report_idx").on(t.reportId),
  })
);

export const documentIngestBatches = pgTable(
  "document_ingest_batches",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    ingestRunId: text("ingest_run_id")
      .notNull()
      .references(() => attachmentIngestRuns.id, { onDelete: "cascade" }),
    attachmentId: text("attachment_id")
      .notNull()
      .references(() => reportAttachments.id, { onDelete: "cascade" }),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    batchIndex: integer("batch_index").notNull(),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    /** Deterministic step key for Workflow retry idempotency. */
    stepKey: text("step_key").notNull(),
    tempObjectKey: text("temp_object_key"),
    status: documentIngestBatchStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    batchSummary: text("batch_summary"),
    continuationNote: text("continuation_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    runBatchUnique: uniqueIndex("document_ingest_batches_run_batch_unique").on(
      t.ingestRunId,
      t.batchIndex
    ),
    stepKeyUnique: uniqueIndex("document_ingest_batches_step_key_unique").on(
      t.stepKey
    ),
  })
);

export const documentPages = pgTable(
  "document_pages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    ingestRunId: text("ingest_run_id")
      .notNull()
      .references(() => attachmentIngestRuns.id, { onDelete: "cascade" }),
    attachmentId: text("attachment_id")
      .notNull()
      .references(() => reportAttachments.id, { onDelete: "cascade" }),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    printedPageLabel: text("printed_page_label"),
    transcript: text("transcript").notNull().default(""),
    visualInterpretation: text("visual_interpretation").notNull().default(""),
    pageContext: text("page_context"),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    runPageUnique: uniqueIndex("document_pages_run_page_unique").on(
      t.ingestRunId,
      t.pageNumber
    ),
    reportIdx: index("document_pages_report_idx").on(t.reportId),
  })
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    ingestRunId: text("ingest_run_id")
      .notNull()
      .references(() => attachmentIngestRuns.id, { onDelete: "cascade" }),
    attachmentId: text("attachment_id")
      .notNull()
      .references(() => reportAttachments.id, { onDelete: "cascade" }),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => documentPages.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    ordinal: integer("ordinal").notNull(),
    rawText: text("raw_text").notNull(),
    contextualText: text("contextual_text").notNull(),
    sourceKind: documentChunkSourceKindEnum("source_kind").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    runPageOrdinalUnique: uniqueIndex(
      "document_chunks_run_page_ordinal_unique"
    ).on(t.ingestRunId, t.pageNumber, t.ordinal),
    reportActiveIdx: index("document_chunks_report_idx").on(t.reportId),
    attachmentIdx: index("document_chunks_attachment_idx").on(t.attachmentId),
  })
);

export const storageOutbox = pgTable(
  "storage_outbox",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    kind: text("kind").notNull(),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    gcsGeneration: text("gcs_generation"),
    reportId: text("report_id"),
    attachmentId: text("attachment_id"),
    status: storageOutboxStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("storage_outbox_status_idx").on(t.status, t.createdAt),
  })
);

export const sectionsRelations = relations(reportSections, ({ one, many }) => ({
  report: one(reports, {
    fields: [reportSections.reportId],
    references: [reports.id],
  }),
  evaluations: many(criteriaEvaluations),
  comments: many(comments),
}));

export const evaluationsRelations = relations(criteriaEvaluations, ({ one }) => ({
  report: one(reports, {
    fields: [criteriaEvaluations.reportId],
    references: [reports.id],
  }),
  section: one(reportSections, {
    fields: [criteriaEvaluations.sectionId],
    references: [reportSections.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  report: one(reports, {
    fields: [comments.reportId],
    references: [reports.id],
  }),
  section: one(reportSections, {
    fields: [comments.sectionId],
    references: [reportSections.id],
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "comment_thread",
  }),
  replies: many(comments, { relationName: "comment_thread" }),
}));

/**
 * Drafting-assistant chat thread. A report can have many named sessions
 * (like Cursor's chat history), so an engineer can start a fresh conversation
 * for a new task without losing prior context. Title is derived from the first
 * user message and can be blank until then.
 */
export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    /**
     * Which assistant owns the thread. `report` is the drafting chat;
     * `analytics` is the Statistical Analysis assistant. Must be filtered on
     * every list/create/find or analytics threads leak into the report UI.
     */
    surface: text("surface").notNull().default("report"),
    title: text("title").notNull().default(""),
    /**
     * `running` while the server is still generating after the client
     * disconnects (tab close). Explicit Cancel sets `cancel_requested`.
     */
    assistantTurnStatus: chatAssistantTurnStatusEnum("assistant_turn_status")
      .notNull()
      .default("idle"),
    assistantTurnStartedAt: timestamp("assistant_turn_started_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportSurfaceUpdatedIdx: index("chat_sessions_report_surface_updated_idx").on(
      t.reportId,
      t.surface,
      t.updatedAt
    ),
  })
);

/**
 * Report drafting-assistant chat transcript, grouped into sessions.
 * `parts` stores the AI SDK v6 UIMessage `parts` array verbatim (text +
 * tool-call/tool-result parts), so the transcript rehydrates with the same
 * proposal cards it showed live. Proposed edits themselves live in `comments`
 * (kind `ai_fix`), so this table never needs to reference suggestions.
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    /** Owning session. Nullable for legacy rows created before sessions existed. */
    sessionId: text("session_id").references(() => chatSessions.id, {
      onDelete: "cascade",
    }),
    role: chatMessageRoleEnum("role").notNull(),
    /** AI SDK v6 UIMessage.parts (text + tool parts). */
    parts: jsonb("parts").notNull().default([]),
    /**
     * Which config produced an assistant turn — `ChatAssistantTurnMetadata`
     * (pace, model id, thinking level, prompt version). The composer shows the
     * user "Quick"/"Deep" and never a model name, so this is the only record
     * of what actually answered. Empty for user turns and legacy rows.
     */
    metadata: jsonb("metadata").notNull().default({}),
    /** workspace_users.id for user turns; null for assistant turns. */
    authorId: text("author_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportCreatedIdx: index("chat_messages_report_created_idx").on(
      t.reportId,
      t.createdAt
    ),
    sessionCreatedIdx: index("chat_messages_session_created_idx").on(
      t.sessionId,
      t.createdAt
    ),
  })
);

/**
 * Persistent cache for Gemini math-extraction results, keyed by SHA-256 of the
 * source image bytes. Survives report deletion so re-importing the same DOCX
 * (or a new report with the same formula) never hits the LLM twice.
 */
export const mathExtractionCache = pgTable("math_extraction_cache", {
  imageHash: text("image_hash").primaryKey(),
  latex: text("latex").notNull(),
  mathml: text("mathml").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** User-submitted report for Improve AI feedback (links to production `reports`). */
export const aiFeedbackSessions = pgTable(
  "ai_feedback_sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    submittedBy: text("submitted_by")
      .notNull()
      .references(() => workspaceUsers.id, { onDelete: "cascade" }),
    sourceType: aiFeedbackSourceTypeEnum("source_type").notNull(),
    status: aiFeedbackSessionStatusEnum("status")
      .notNull()
      .default("evaluating"),
    sourceLabel: text("source_label").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportSubmitterUnique: uniqueIndex(
      "ai_feedback_sessions_report_submitter_unique"
    ).on(t.reportId, t.submittedBy),
  })
);

export const aiFeedbackResponses = pgTable(
  "ai_feedback_responses",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sessionId: text("session_id")
      .notNull()
      .references(() => aiFeedbackSessions.id, { onDelete: "cascade" }),
    criterionKey: text("criterion_key").notNull(),
    section: text("section").notNull(),
    aiStatus: criterionStatusEnum("ai_status").notNull(),
    aiReasoning: text("ai_reasoning").notNull().default(""),
    criteriaEvaluationAgreement: text("criteria_evaluation_agreement"),
    reasoningAgreement: text("reasoning_agreement"),
    humanComment: text("human_comment").notNull().default(""),
    suggestedStatus: criterionStatusEnum("suggested_status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    sessionCriterionUnique: uniqueIndex(
      "ai_feedback_responses_session_criterion_unique"
    ).on(t.sessionId, t.criterionKey),
  })
);

export const aiFeedbackSessionsRelations = relations(
  aiFeedbackSessions,
  ({ one, many }) => ({
    report: one(reports, {
      fields: [aiFeedbackSessions.reportId],
      references: [reports.id],
    }),
    submitter: one(workspaceUsers, {
      fields: [aiFeedbackSessions.submittedBy],
      references: [workspaceUsers.id],
    }),
    responses: many(aiFeedbackResponses),
  })
);

export const aiFeedbackResponsesRelations = relations(
  aiFeedbackResponses,
  ({ one }) => ({
    session: one(aiFeedbackSessions, {
      fields: [aiFeedbackResponses.sessionId],
      references: [aiFeedbackSessions.id],
    }),
  })
);

/** Append-only Part 11 audit trail (hash chain enforced in DB triggers). */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().notNull(),
    reportId: text("report_id"),
    actorId: text("actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    actorRole: text("actor_role").notNull(),
    action: auditActionEnum("action").notNull(),
    entityType: auditEntityEnum("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    metadata: jsonb("metadata").notNull().default({}),
    prevHash: text("prev_hash").notNull().default(""),
    hash: text("hash").notNull().default(""),
    payloadVersion: integer("payload_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportSeqIdx: index("audit_events_report_seq_idx").on(t.reportId, t.seq),
    actorCreatedIdx: index("audit_events_actor_created_idx").on(
      t.actorId,
      t.createdAt
    ),
    entityIdx: index("audit_events_entity_idx").on(t.entityType, t.entityId),
  })
);

/** Git-like section content history: base snapshot + JSON-Patch diffs. */
export const sectionContentVersions = pgTable(
  "section_content_versions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    versionNo: integer("version_no").notNull(),
    isSnapshot: boolean("is_snapshot").notNull().default(false),
    contentSnapshot: jsonb("content_snapshot"),
    diff: jsonb("diff"),
    contentHash: text("content_hash").notNull(),
    auditEventId: text("audit_event_id")
      .notNull()
      .references(() => auditEvents.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportSectionVersionUnique: uniqueIndex(
      "section_content_versions_report_section_version_unique"
    ).on(t.reportId, t.section, t.versionNo),
  })
);

/** Part 11 Subpart C electronic signature records. */
export const electronicSignatures = pgTable("electronic_signatures", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reportId: text("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  signerId: text("signer_id").notNull(),
  signerName: text("signer_name").notNull(),
  meaning: signatureMeaningEnum("meaning").notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  authMethod: text("auth_method").notNull().default("password"),
  /** SHA-256 hash of all section content at signing time. */
  contentHash: text("content_hash"),
  /** Monotonic version sequence across all sections at signing time. */
  signedVersionSeq: integer("signed_version_seq"),
  auditEventId: text("audit_event_id")
    .notNull()
    .references(() => auditEvents.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const retentionSettings = pgTable("retention_settings", {
  id: text("id").primaryKey().default("default"),
  reportRetentionDays: integer("report_retention_days").notNull().default(2555),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditEventsRelations = relations(auditEvents, ({ one, many }) => ({
  report: one(reports, {
    fields: [auditEvents.reportId],
    references: [reports.id],
  }),
  sectionVersions: many(sectionContentVersions),
  signatures: many(electronicSignatures),
}));

export const sectionContentVersionsRelations = relations(
  sectionContentVersions,
  ({ one }) => ({
    report: one(reports, {
      fields: [sectionContentVersions.reportId],
      references: [reports.id],
    }),
    auditEvent: one(auditEvents, {
      fields: [sectionContentVersions.auditEventId],
      references: [auditEvents.id],
    }),
  })
);

export const electronicSignaturesRelations = relations(
  electronicSignatures,
  ({ one }) => ({
    report: one(reports, {
      fields: [electronicSignatures.reportId],
      references: [reports.id],
    }),
    auditEvent: one(auditEvents, {
      fields: [electronicSignatures.auditEventId],
      references: [auditEvents.id],
    }),
  })
);

export const reportAttachmentsRelations = relations(
  reportAttachments,
  ({ one, many }) => ({
    report: one(reports, {
      fields: [reportAttachments.reportId],
      references: [reports.id],
    }),
    ingestRuns: many(attachmentIngestRuns),
  })
);

export const attachmentIngestRunsRelations = relations(
  attachmentIngestRuns,
  ({ one, many }) => ({
    attachment: one(reportAttachments, {
      fields: [attachmentIngestRuns.attachmentId],
      references: [reportAttachments.id],
    }),
    report: one(reports, {
      fields: [attachmentIngestRuns.reportId],
      references: [reports.id],
    }),
    batches: many(documentIngestBatches),
    pages: many(documentPages),
    chunks: many(documentChunks),
  })
);

export const documentIngestBatchesRelations = relations(
  documentIngestBatches,
  ({ one }) => ({
    ingestRun: one(attachmentIngestRuns, {
      fields: [documentIngestBatches.ingestRunId],
      references: [attachmentIngestRuns.id],
    }),
  })
);

export const documentPagesRelations = relations(
  documentPages,
  ({ one, many }) => ({
    ingestRun: one(attachmentIngestRuns, {
      fields: [documentPages.ingestRunId],
      references: [attachmentIngestRuns.id],
    }),
    chunks: many(documentChunks),
  })
);

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  ingestRun: one(attachmentIngestRuns, {
    fields: [documentChunks.ingestRunId],
    references: [attachmentIngestRuns.id],
  }),
  page: one(documentPages, {
    fields: [documentChunks.pageId],
    references: [documentPages.id],
  }),
}));

export const statisticalWorkspaces = pgTable(
  "statistical_workspaces",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    name: text("name").notNull().default("Worksheet"),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    worksheet: jsonb("worksheet").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportIdUnique: uniqueIndex("statistical_workspaces_report_id_unique").on(
      t.reportId
    ),
  })
);

export const statisticalAnalyses = pgTable(
  "statistical_analyses",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => statisticalWorkspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("capability_sixpack_normal"),
    title: text("title").notNull(),
    config: jsonb("config").notNull(),
    results: jsonb("results").notNull(),
    sourceHash: text("source_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    workspaceCreatedIdx: index("statistical_analyses_workspace_created_idx").on(
      t.workspaceId,
      t.createdAt
    ),
  })
);

export const statisticalWorkspacesRelations = relations(
  statisticalWorkspaces,
  ({ one, many }) => ({
    report: one(reports, {
      fields: [statisticalWorkspaces.reportId],
      references: [reports.id],
    }),
    analyses: many(statisticalAnalyses),
  })
);

export const statisticalAnalysesRelations = relations(
  statisticalAnalyses,
  ({ one }) => ({
    workspace: one(statisticalWorkspaces, {
      fields: [statisticalAnalyses.workspaceId],
      references: [statisticalWorkspaces.id],
    }),
  })
);

export type ReportStatus = (typeof reportStatusEnum.enumValues)[number];
export type DocumentType = (typeof documentTypeEnum.enumValues)[number];
/** Free-text section key; validated by the document-type registry at write time. */
export type SectionType = string;
export type InvestigationSectionType =
  (typeof INVESTIGATION_SECTION_TYPES)[number];
export type CriterionStatus = (typeof criterionStatusEnum.enumValues)[number];
export type CommentStatus = (typeof commentStatusEnum.enumValues)[number];
export type CommentKind = (typeof commentKindEnum.enumValues)[number];
export type AiFeedbackSourceType =
  (typeof aiFeedbackSourceTypeEnum.enumValues)[number];
export type AiFeedbackSessionStatus =
  (typeof aiFeedbackSessionStatusEnum.enumValues)[number];
export type ChatMessageRole = (typeof chatMessageRoleEnum.enumValues)[number];
export type AuditAction = (typeof auditActionEnum.enumValues)[number];
export type AuditEntity = (typeof auditEntityEnum.enumValues)[number];
export type SignatureMeaning = (typeof signatureMeaningEnum.enumValues)[number];
export type AttachmentProcessingStatus =
  (typeof attachmentProcessingStatusEnum.enumValues)[number];
export type AttachmentIngestRunStatus =
  (typeof attachmentIngestRunStatusEnum.enumValues)[number];
export type DocumentIngestBatchStatus =
  (typeof documentIngestBatchStatusEnum.enumValues)[number];
export type DocumentChunkSourceKind =
  (typeof documentChunkSourceKindEnum.enumValues)[number];
export type StorageOutboxStatus =
  (typeof storageOutboxStatusEnum.enumValues)[number];

export * from "./auth";
