import {
  pgTable,
  text,
  timestamp,
  jsonb,
  pgEnum,
  boolean,
  integer,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";


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
  "ai_fix",
  "ai_grammar",
  "ai_tone",
  "ai_removal",
  "ai_redraft",
]);

export const criteriaReviewStatusEnum = pgEnum("criteria_review_status", [
  "pending",
  "in_progress",
  "completed",
]);

export const userRoleEnum = pgEnum("user_role", ["engineer", "manager"]);

export const workspaceUsers = pgTable(
  "workspace_users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    employeeId: text("employee_id").notNull(),
    role: userRoleEnum("role").notNull().default("engineer"),
    title: text("title").notNull().default("Engineer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    employeeIdUnique: uniqueIndex("workspace_users_employee_id_unique").on(
      t.employeeId
    ),
  })
);

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
    deviationNoUnique: uniqueIndex("reports_deviation_no_unique").on(t.deviationNo),
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
  /** Links AI-generated comments to the criteria evaluation that emitted them. */
  evaluationId: text("evaluation_id").references(
    (): AnyPgColumn => criteriaEvaluations.id,
    { onDelete: "set null" }
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reportsRelations = relations(reports, ({ many }) => ({
  sections: many(reportSections),
  evaluations: many(criteriaEvaluations),
  comments: many(comments),
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

/** Sample-report human QA (not tied to production `reports` rows). */
export const criteriaReviewReports = pgTable("criteria_review_reports", {
  id: text("id").primaryKey(),
  sourceFile: text("source_file").notNull(),
  deviationNo: text("deviation_no").notNull(),
  reportDate: text("report_date").notNull(),
  promptVersion: text("prompt_version").notNull(),
  totalCriterionCount: integer("total_criterion_count").notNull(),
  input: jsonb("input").notNull(),
  expectedOutput: jsonb("expected_output").notNull(),
  humanReviewStatus: criteriaReviewStatusEnum("human_review_status")
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const criteriaReviewReviewers = pgTable(
  "criteria_review_reviewers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    employeeId: text("employee_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    employeeIdUnique: uniqueIndex(
      "criteria_review_reviewers_employee_id_unique"
    ).on(t.employeeId),
  })
);

export const criteriaReviewSubmissions = pgTable(
  "criteria_review_submissions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    reportId: text("report_id")
      .notNull()
      .references(() => criteriaReviewReports.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => criteriaReviewReviewers.id, { onDelete: "cascade" }),
    status: criteriaReviewStatusEnum("status").notNull().default("pending"),
    answers: jsonb("answers").notNull().default({}),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportReviewerUnique: uniqueIndex(
      "criteria_review_submissions_report_reviewer_unique"
    ).on(t.reportId, t.reviewerId),
  })
);

export const criteriaReviewReportsRelations = relations(
  criteriaReviewReports,
  ({ many }) => ({
    submissions: many(criteriaReviewSubmissions),
  })
);

export const criteriaReviewSubmissionsRelations = relations(
  criteriaReviewSubmissions,
  ({ one }) => ({
    report: one(criteriaReviewReports, {
      fields: [criteriaReviewSubmissions.reportId],
      references: [criteriaReviewReports.id],
    }),
    reviewer: one(criteriaReviewReviewers, {
      fields: [criteriaReviewSubmissions.reviewerId],
      references: [criteriaReviewReviewers.id],
    }),
  })
);

export type ReportStatus = (typeof reportStatusEnum.enumValues)[number];
export type SectionType = (typeof sectionTypeEnum.enumValues)[number];
export type CriterionStatus = (typeof criterionStatusEnum.enumValues)[number];
export type CommentStatus = (typeof commentStatusEnum.enumValues)[number];
export type CommentKind = (typeof commentKindEnum.enumValues)[number];
export type CriteriaReviewStatus =
  (typeof criteriaReviewStatusEnum.enumValues)[number];
