import { env } from "cloudflare:workers";
import seedQuestions from "../data/seed-questions.json";
import { STUDY_CATALOG, inferStudyItemIds } from "../lib/study-catalog";
import { SUBJECTS, subjectCodeFromName } from "../lib/subjects";
import type { SeedQuestion } from "../lib/types";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS subjects (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    display_order INTEGER NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS source_documents (
    id TEXT PRIMARY KEY,
    subject_code TEXT NOT NULL REFERENCES subjects(code),
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    page_count INTEGER,
    content_hash TEXT,
    UNIQUE(subject_code, normalized_title)
  )`,
  `CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    subject_code TEXT NOT NULL REFERENCES subjects(code),
    source_document_id TEXT REFERENCES source_documents(id),
    source_page INTEGER,
    source_question_no TEXT,
    stem TEXT NOT NULL,
    choices_json TEXT NOT NULL,
    answer_index INTEGER,
    explanation TEXT NOT NULL DEFAULT '',
    duplicate_group_id TEXT NOT NULL,
    ocr_confidence REAL NOT NULL DEFAULT 0,
    review_status TEXT NOT NULL DEFAULT 'needs_review',
    importance_score INTEGER NOT NULL DEFAULT 0,
    importance_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_document_id, source_question_no)
  )`,
  `CREATE INDEX IF NOT EXISTS questions_subject_ready_idx
    ON questions(subject_code, review_status, importance_score)`,
  `CREATE INDEX IF NOT EXISTS questions_duplicate_group_idx
    ON questions(duplicate_group_id)`,
  `CREATE TABLE IF NOT EXISTS importance_marks (
    id TEXT PRIMARY KEY,
    source_document_id TEXT REFERENCES source_documents(id),
    source_page INTEGER,
    source_question_no TEXT,
    question_id TEXT REFERENCES questions(id),
    mark_type TEXT NOT NULL,
    raw_text TEXT,
    confidence REAL NOT NULL DEFAULT 0,
    reviewed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS importance_marks_source_idx
    ON importance_marks(source_document_id, source_page, source_question_no)`,
  `CREATE INDEX IF NOT EXISTS importance_marks_question_review_idx
    ON importance_marks(question_id, reviewed)`,
  `CREATE TABLE IF NOT EXISTS study_items (
    id TEXT PRIMARY KEY,
    subject_code TEXT REFERENCES subjects(code),
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    content TEXT NOT NULL,
    canonical_key TEXT NOT NULL,
    aliases_json TEXT NOT NULL DEFAULT '[]',
    conditions TEXT,
    units TEXT,
    caution TEXT,
    frequency INTEGER NOT NULL DEFAULT 0,
    importance_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE(kind, canonical_key)
  )`,
  `CREATE TABLE IF NOT EXISTS question_study_items (
    question_id TEXT NOT NULL REFERENCES questions(id),
    study_item_id TEXT NOT NULL REFERENCES study_items(id),
    role TEXT NOT NULL DEFAULT 'solution',
    confidence REAL NOT NULL DEFAULT 0,
    UNIQUE(question_id, study_item_id)
  )`,
  `CREATE INDEX IF NOT EXISTS question_study_items_study_idx
    ON question_study_items(study_item_id)`,
  `CREATE TABLE IF NOT EXISTS exam_sessions (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    seed TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    total_questions INTEGER NOT NULL,
    correct_count INTEGER,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS exam_items (
    id TEXT PRIMARY KEY,
    exam_session_id TEXT NOT NULL REFERENCES exam_sessions(id),
    question_id TEXT NOT NULL REFERENCES questions(id),
    subject_code TEXT NOT NULL,
    position INTEGER NOT NULL,
    duplicate_group_id TEXT NOT NULL,
    choice_order_json TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    selected_index INTEGER,
    is_correct INTEGER,
    answered_at TEXT,
    UNIQUE(exam_session_id, position),
    UNIQUE(exam_session_id, duplicate_group_id)
  )`,
  `CREATE INDEX IF NOT EXISTS exam_items_session_idx
    ON exam_items(exam_session_id)`,
  `CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    exam_session_id TEXT NOT NULL REFERENCES exam_sessions(id),
    question_id TEXT NOT NULL REFERENCES questions(id),
    selected_index INTEGER,
    is_correct INTEGER NOT NULL,
    answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS attempts_session_idx ON attempts(exam_session_id)`,
  `CREATE INDEX IF NOT EXISTS attempts_question_idx
    ON attempts(question_id, answered_at)`,
];

let databaseReady: Promise<void> | null = null;

export function getD1(): D1Database {
  const database = env.DB as D1Database | undefined;
  if (!database) {
    throw new Error("문제은행 데이터베이스가 연결되지 않았습니다.");
  }
  return database;
}

export function ensureDatabase(): Promise<void> {
  databaseReady ??= initializeDatabase();
  return databaseReady;
}

async function initializeDatabase() {
  const database = getD1();
  for (const statement of schemaStatements) {
    await database.prepare(statement).run();
  }

  await database.batch(
    SUBJECTS.map((subject) =>
      database
        .prepare(
          `INSERT INTO subjects (code, name, display_order)
           VALUES (?, ?, ?)
           ON CONFLICT(code) DO UPDATE SET
             name = excluded.name,
             display_order = excluded.display_order`,
        )
        .bind(subject.code, subject.name, subject.order),
    ),
  );

  const verifiedSeed = seedQuestions as SeedQuestion[];
  const primarySeedDocument = verifiedSeed[0]?.source_doc.normalize("NFC") ?? "";
  const existingSeedCount = primarySeedDocument
    ? await database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM questions q
           JOIN source_documents sd ON sd.id = q.source_document_id
           WHERE sd.normalized_title = ?`,
        )
        .bind(primarySeedDocument)
        .first<{ count: number }>()
    : null;

  // The hosted database persists between worker starts. Re-seed only when the
  // bundled verified bank grows, avoiding 100 upserts on every cold start.
  if (Number(existingSeedCount?.count ?? 0) < verifiedSeed.length) {
    await seedVerifiedQuestions(database, verifiedSeed);
  }
}

async function seedVerifiedQuestions(database: D1Database, rows: SeedQuestion[]) {
  const prepared = rows.flatMap((raw) => {
    const subjectCode = subjectCodeFromName(raw.subject);
    if (!subjectCode || !raw.stem.trim() || raw.choices.length < 2) return [];

    const documentId = `doc-${shortHash(`${subjectCode}:${raw.source_doc}`)}`;
    const questionId = `q-${shortHash(
      `${subjectCode}:${raw.source_doc}:${raw.source_no}`,
    )}`;
    const answerIndex = parseAnswerIndex(raw.answer, raw.choices.length);
    const duplicateGroupId =
      raw.duplicate_group ??
      `dup-${shortHash(`${subjectCode}:${normalizeQuestion(raw.stem)}`)}`;
    const reviewStatus =
      !raw.needs_review && answerIndex !== null && raw.confidence >= 0.9
        ? "verified"
        : "needs_review";
    const searchableText = `${raw.stem} ${raw.explanation}`;
    const inferredIds = new Set([
      ...(raw.formula_keys ?? []),
      ...inferStudyItemIds(searchableText),
    ]);

    return [
      {
        raw,
        subjectCode,
        documentId,
        questionId,
        answerIndex,
        duplicateGroupId,
        reviewStatus,
        studyItems: STUDY_CATALOG.filter((item) => inferredIds.has(item.id)),
      },
    ];
  });

  const documents = new Map<
    string,
    { id: string; subjectCode: string; title: string; normalizedTitle: string }
  >();
  for (const item of prepared) {
    documents.set(item.documentId, {
      id: item.documentId,
      subjectCode: item.subjectCode,
      title: item.raw.source_doc,
      normalizedTitle: item.raw.source_doc.normalize("NFC"),
    });
  }

  await runStatementBatches(
    database,
    Array.from(documents.values()).map((document) =>
      database
        .prepare(
          `INSERT INTO source_documents
            (id, subject_code, title, normalized_title)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             normalized_title = excluded.normalized_title`,
        )
        .bind(
          document.id,
          document.subjectCode,
          document.title,
          document.normalizedTitle,
        ),
    ),
  );

  await runStatementBatches(
    database,
    prepared.map((item) =>
      database
        .prepare(
          `INSERT INTO questions (
            id, subject_code, source_document_id, source_page,
            source_question_no, stem, choices_json, answer_index, explanation,
            duplicate_group_id, ocr_confidence, review_status,
            importance_score, importance_reason, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            source_page = excluded.source_page,
            source_question_no = excluded.source_question_no,
            stem = excluded.stem,
            choices_json = excluded.choices_json,
            answer_index = excluded.answer_index,
            explanation = excluded.explanation,
            duplicate_group_id = excluded.duplicate_group_id,
            ocr_confidence = excluded.ocr_confidence,
            review_status = excluded.review_status,
            importance_score = excluded.importance_score,
            importance_reason = excluded.importance_reason,
            updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          item.questionId,
          item.subjectCode,
          item.documentId,
          item.raw.source_page,
          String(item.raw.source_no),
          item.raw.stem.trim(),
          JSON.stringify(item.raw.choices.map((choice) => choice.trim())),
          item.answerIndex,
          item.raw.explanation?.trim() ?? "",
          item.duplicateGroupId,
          item.raw.confidence,
          item.reviewStatus,
          item.raw.importance_score ?? 0,
          item.raw.importance_reason ?? null,
        ),
    ),
  );

  const referencedStudyItems = new Map<
    string,
    (typeof STUDY_CATALOG)[number]
  >();
  for (const item of prepared) {
    for (const studyItem of item.studyItems) {
      referencedStudyItems.set(studyItem.id, studyItem);
    }
  }

  await runStatementBatches(
    database,
    Array.from(referencedStudyItems.values()).map((item) =>
      prepareStudyItemUpsert(database, item),
    ),
  );
  await runStatementBatches(
    database,
    prepared.flatMap((item) =>
      item.studyItems.map((studyItem) =>
        database
          .prepare(
            `INSERT INTO question_study_items
              (question_id, study_item_id, role, confidence)
             VALUES (?, ?, 'solution', ?)
             ON CONFLICT(question_id, study_item_id) DO UPDATE SET
               confidence = excluded.confidence`,
          )
          .bind(item.questionId, studyItem.id, item.raw.confidence),
      ),
    ),
  );

  await database
    .prepare(
      `UPDATE study_items
       SET frequency = (
         SELECT COUNT(DISTINCT q.duplicate_group_id)
         FROM question_study_items qsi
         JOIN questions q ON q.id = qsi.question_id
         WHERE qsi.study_item_id = study_items.id
       ),
       importance_count = (
         SELECT COUNT(DISTINCT q.duplicate_group_id)
         FROM question_study_items qsi
         JOIN questions q ON q.id = qsi.question_id
         WHERE qsi.study_item_id = study_items.id
           AND q.importance_score > 0
       )`,
    )
    .run();
}

async function runStatementBatches(
  database: D1Database,
  statements: D1PreparedStatement[],
) {
  const batchSize = 50;
  for (let index = 0; index < statements.length; index += batchSize) {
    await database.batch(statements.slice(index, index + batchSize));
  }
}

function prepareStudyItemUpsert(
  database: D1Database,
  item: (typeof STUDY_CATALOG)[number],
) {
  return database
    .prepare(
      `INSERT INTO study_items (
        id, subject_code, kind, title, prompt, content, canonical_key,
        aliases_json, conditions, units, caution
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        prompt = excluded.prompt,
        content = excluded.content,
        aliases_json = excluded.aliases_json,
        conditions = excluded.conditions,
        units = excluded.units,
        caution = excluded.caution`,
    )
    .bind(
      item.id,
      item.subjectCode,
      item.kind,
      item.title,
      item.prompt,
      item.content,
      item.canonicalKey,
      JSON.stringify(item.aliases),
      item.conditions ?? null,
      item.units ?? null,
      item.caution ?? null,
    );
}

function parseAnswerIndex(value: SeedQuestion["answer"], choiceCount: number) {
  if (value === null || value === undefined) return null;
  const circled: Record<string, number> = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };
  const parsed =
    typeof value === "number"
      ? value
      : circled[value.trim()] ?? Number(value.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > choiceCount) return null;
  return parsed - 1;
}

function normalizeQuestion(value: string) {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[0-9]+(?:\.[0-9]+)?/g, "#")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}#]/gu, "")
    .slice(0, 280);
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
