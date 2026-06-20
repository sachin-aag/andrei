import {
  pgTable,
  text,
  timestamp,
  jsonb,
  pgEnum,
  boolean,
  integer,
  index,
  uniqueIndex,
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

export const userRoleEnum = pgEnum("user_role", ["engineer", "manager"]);

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
    /** True when an admin set a temporary password; user must choose a new one on next login. */
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex("workspace_users_email_unique").on(t.email),
  })
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  email: text("email").notNull(),
  /** SHA-256 hash of the raw token sent via email. */
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** Null until the token is consumed. */
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordHistory = pgTable(
  "password_history",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => workspaceUsers.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedAtIdx: index("password_history_user_created_at_idx").on(
      t.userId,
      t.createdAt
    ),
  })
);

export const passwordPolicySettings = pgTable("password_policy_settings", {
  id: text("id").primaryKey().default("default"),
  minLength: integer("min_length").notNull().default(6),
  requireLetter: boolean("require_letter").notNull().default(true),
  requireNumber: boolean("require_number").notNull().default(true),
  requireSpecial: boolean("require_special").notNull().default(true),
  expiryDays: integer("expiry_days").notNull().default(90),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    deviationNoUnique: uniqueIndex("reports_deviation_no_unique").on(t.authorId, t.deviationNo),
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
}));

export const reportSourceDocxRelations = relations(reportSourceDocx, ({ one }) => ({
  report: one(reports, {
    fields: [reportSourceDocx.reportId],
    references: [reports.id],
  }),
}));

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

export type ReportStatus = (typeof reportStatusEnum.enumValues)[number];
export type SectionType = (typeof sectionTypeEnum.enumValues)[number];
export type CriterionStatus = (typeof criterionStatusEnum.enumValues)[number];
export type CommentStatus = (typeof commentStatusEnum.enumValues)[number];
export type CommentKind = (typeof commentKindEnum.enumValues)[number];
export type AiFeedbackSourceType =
  (typeof aiFeedbackSourceTypeEnum.enumValues)[number];
export type AiFeedbackSessionStatus =
  (typeof aiFeedbackSessionStatusEnum.enumValues)[number];

export * from "./auth";
