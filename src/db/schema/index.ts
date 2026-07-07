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
  uniqueIndex,
  index,
  primaryKey,
  customType,
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

export const sectionTypeEnum = pgEnum("section_type", [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
  "documents_reviewed",
  "attachments",
  "signature_approvals",
]);

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
  ["pending", "processing", "ready", "failed"]
);

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
    /** Non-null means the account is deactivated and cannot sign in. */
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

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    deviationNo: text("deviation_no").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    toolsUsed: jsonb("tools_used")
      .$type<{ sixM: boolean; fiveWhy: boolean; brainstorming: boolean }>()
      .notNull()
      .default({ sixM: false, fiveWhy: false, brainstorming: false }),
    otherTools: text("other_tools").notNull().default(""),
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
    deviationNoUnique: uniqueIndex("reports_deviation_no_unique").on(t.authorId, t.deviationNo),
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
    section: sectionTypeEnum("section").notNull(),
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

/** PDF attachments stored in GCS; metadata only in Postgres. */
export const reportAttachments = pgTable(
  "report_attachments",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull().default(""),
    gcsObjectKey: text("gcs_object_key").notNull(),
    uploadedById: text("uploaded_by_id").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processingStatus: attachmentProcessingStatusEnum("processing_status")
      .notNull()
      .default("pending"),
    extractedTextKey: text("extracted_text_key"),
  },
  (t) => ({
    reportIdIdx: index("report_attachments_report_id_idx").on(t.reportId),
  })
);

export const criteriaEvaluations = pgTable("criteria_evaluations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  reportId: text("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  sectionId: text("section_id")
    .notNull()
    .references(() => reportSections.id, { onDelete: "cascade" }),
  section: sectionTypeEnum("section").notNull(),
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
  section: sectionTypeEnum("section"),
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
  attachments: many(reportAttachments),
  managers: many(reportManagers),
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

export const reportAttachmentsRelations = relations(
  reportAttachments,
  ({ one }) => ({
    report: one(reports, {
      fields: [reportAttachments.reportId],
      references: [reports.id],
    }),
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
    section: sectionTypeEnum("section").notNull(),
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
    section: sectionTypeEnum("section").notNull(),
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

export type ReportStatus = (typeof reportStatusEnum.enumValues)[number];
export type SectionType = (typeof sectionTypeEnum.enumValues)[number];
export type CriterionStatus = (typeof criterionStatusEnum.enumValues)[number];
export type CommentStatus = (typeof commentStatusEnum.enumValues)[number];
export type CommentKind = (typeof commentKindEnum.enumValues)[number];
export type AiFeedbackSourceType =
  (typeof aiFeedbackSourceTypeEnum.enumValues)[number];
export type AiFeedbackSessionStatus =
  (typeof aiFeedbackSessionStatusEnum.enumValues)[number];
export type AuditAction = (typeof auditActionEnum.enumValues)[number];
export type AuditEntity = (typeof auditEntityEnum.enumValues)[number];
export type SignatureMeaning = (typeof signatureMeaningEnum.enumValues)[number];

export * from "./auth";
