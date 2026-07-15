import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const subjects = sqliteTable(
  "subjects",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull(),
  },
  (table) => [uniqueIndex("subjects_display_order_idx").on(table.displayOrder)],
);

export const sourceDocuments = sqliteTable(
  "source_documents",
  {
    id: text("id").primaryKey(),
    subjectCode: text("subject_code")
      .notNull()
      .references(() => subjects.code),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    pageCount: integer("page_count"),
    contentHash: text("content_hash"),
  },
  (table) => [
    uniqueIndex("source_documents_subject_title_idx").on(
      table.subjectCode,
      table.normalizedTitle,
    ),
  ],
);

export const questions = sqliteTable(
  "questions",
  {
    id: text("id").primaryKey(),
    subjectCode: text("subject_code")
      .notNull()
      .references(() => subjects.code),
    sourceDocumentId: text("source_document_id").references(
      () => sourceDocuments.id,
    ),
    sourcePage: integer("source_page"),
    sourceQuestionNo: text("source_question_no"),
    stem: text("stem").notNull(),
    choicesJson: text("choices_json").notNull(),
    answerIndex: integer("answer_index"),
    explanation: text("explanation").notNull().default(""),
    duplicateGroupId: text("duplicate_group_id").notNull(),
    ocrConfidence: real("ocr_confidence").notNull().default(0),
    reviewStatus: text("review_status").notNull().default("needs_review"),
    importanceScore: integer("importance_score").notNull().default(0),
    importanceReason: text("importance_reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("questions_source_no_idx").on(
      table.sourceDocumentId,
      table.sourceQuestionNo,
    ),
    index("questions_subject_ready_idx").on(
      table.subjectCode,
      table.reviewStatus,
      table.importanceScore,
    ),
    index("questions_duplicate_group_idx").on(table.duplicateGroupId),
  ],
);

export const importanceMarks = sqliteTable(
  "importance_marks",
  {
    id: text("id").primaryKey(),
    sourceDocumentId: text("source_document_id").references(
      () => sourceDocuments.id,
    ),
    sourcePage: integer("source_page"),
    sourceQuestionNo: text("source_question_no"),
    questionId: text("question_id").references(() => questions.id),
    markType: text("mark_type").notNull(),
    rawText: text("raw_text"),
    confidence: real("confidence").notNull().default(0),
    reviewed: integer("reviewed", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("importance_marks_source_idx").on(
      table.sourceDocumentId,
      table.sourcePage,
      table.sourceQuestionNo,
    ),
    index("importance_marks_question_review_idx").on(
      table.questionId,
      table.reviewed,
    ),
  ],
);

export const studyItems = sqliteTable(
  "study_items",
  {
    id: text("id").primaryKey(),
    subjectCode: text("subject_code").references(() => subjects.code),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    content: text("content").notNull(),
    canonicalKey: text("canonical_key").notNull(),
    aliasesJson: text("aliases_json").notNull().default("[]"),
    conditions: text("conditions"),
    units: text("units"),
    caution: text("caution"),
    frequency: integer("frequency").notNull().default(0),
    importanceCount: integer("importance_count").notNull().default(0),
  },
  (table) => [
    uniqueIndex("study_items_kind_key_idx").on(table.kind, table.canonicalKey),
    index("study_items_frequency_idx").on(table.frequency),
  ],
);

export const questionStudyItems = sqliteTable(
  "question_study_items",
  {
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    studyItemId: text("study_item_id")
      .notNull()
      .references(() => studyItems.id),
    role: text("role").notNull().default("solution"),
    confidence: real("confidence").notNull().default(0),
  },
  (table) => [
    uniqueIndex("question_study_items_unique_idx").on(
      table.questionId,
      table.studyItemId,
    ),
    index("question_study_items_study_idx").on(table.studyItemId),
  ],
);

export const examSessions = sqliteTable("exam_sessions", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull(),
  seed: text("seed").notNull(),
  status: text("status").notNull().default("in_progress"),
  totalQuestions: integer("total_questions").notNull(),
  correctCount: integer("correct_count"),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  submittedAt: text("submitted_at"),
});

export const examItems = sqliteTable(
  "exam_items",
  {
    id: text("id").primaryKey(),
    examSessionId: text("exam_session_id")
      .notNull()
      .references(() => examSessions.id),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    subjectCode: text("subject_code").notNull(),
    position: integer("position").notNull(),
    duplicateGroupId: text("duplicate_group_id").notNull(),
    choiceOrderJson: text("choice_order_json").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    selectedIndex: integer("selected_index"),
    isCorrect: integer("is_correct", { mode: "boolean" }),
    answeredAt: text("answered_at"),
  },
  (table) => [
    uniqueIndex("exam_items_position_idx").on(
      table.examSessionId,
      table.position,
    ),
    uniqueIndex("exam_items_duplicate_idx").on(
      table.examSessionId,
      table.duplicateGroupId,
    ),
    index("exam_items_session_idx").on(table.examSessionId),
  ],
);

export const attempts = sqliteTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    examSessionId: text("exam_session_id")
      .notNull()
      .references(() => examSessions.id),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    selectedIndex: integer("selected_index"),
    isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
    answeredAt: text("answered_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("attempts_session_idx").on(table.examSessionId),
    index("attempts_question_idx").on(table.questionId, table.answeredAt),
  ],
);
