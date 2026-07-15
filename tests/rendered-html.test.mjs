import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("ships the five-subject exam experience", async () => {
  const [page, exam, subjects] = await Promise.all([
    source("app/page.tsx"),
    source("components/ExamWorkspace.tsx"),
    source("lib/subjects.ts"),
  ]);

  assert.match(page, /import \{ Dashboard \}/);
  assert.match(page, /<Dashboard \/>/);
  assert.match(exam, /fetch\("\/api\/dashboard"\)/);
  assert.match(exam, /fetch\("\/api\/exams"/);
  assert.match(exam, /mode === "full" \? 20 : 2/);
  assert.match(exam, /dashboard\?\.fullExamReady/);

  const subjectCodes = [
    "electromagnetics",
    "electric-machines",
    "power-engineering",
    "circuit-theory",
    "electrical-regulations",
  ];
  for (const code of subjectCodes) assert.match(subjects, new RegExp(code));
});

test("defines the persistent question, exam, importance, and study schema", async () => {
  const schema = await source("db/schema.ts");
  const tableExports = [
    ...schema.matchAll(/export const (\w+) = sqliteTable\(/g),
  ].map((match) => match[1]);

  assert.deepEqual(tableExports, [
    "subjects",
    "sourceDocuments",
    "questions",
    "importanceMarks",
    "studyItems",
    "questionStudyItems",
    "examSessions",
    "examItems",
    "attempts",
  ]);
  assert.match(schema, /questions_duplicate_group_idx/);
  assert.match(schema, /exam_items_duplicate_idx/);
  assert.match(schema, /study_items_kind_key_idx/);
});

test("includes 25 verified seed questions evenly across all subjects", async () => {
  const questions = JSON.parse(await source("data/seed-questions.json"));
  assert.equal(questions.length, 25);

  const counts = new Map();
  for (const question of questions) {
    counts.set(question.subject, (counts.get(question.subject) ?? 0) + 1);
    assert.equal(question.choices.length, 4);
    assert.ok(Number.isInteger(question.answer));
    assert.ok(question.answer >= 1 && question.answer <= 4);
    assert.equal(question.needs_review, false);
    assert.ok(question.confidence >= 0.9);
    assert.ok(question.stem.length > 0);
    assert.ok(question.explanation.length > 0);
  }

  assert.equal(counts.size, 5);
  for (const count of counts.values()) assert.equal(count, 5);
});

test("provides every API route and both persistence bindings", async () => {
  const routes = [
    "app/api/dashboard/route.ts",
    "app/api/exams/route.ts",
    "app/api/exams/[id]/route.ts",
    "app/api/exams/[id]/answer/route.ts",
    "app/api/exams/[id]/submit/route.ts",
    "app/api/study-items/route.ts",
    "app/api/review/route.ts",
  ];
  await Promise.all(routes.map((route) => access(new URL(route, root))));

  const hosting = JSON.parse(await source(".openai/hosting.json"));
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "QUESTION_ASSETS");
});
