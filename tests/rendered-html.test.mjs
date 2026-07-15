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

test("includes 100 verified source questions evenly across all subjects", async () => {
  const questions = JSON.parse(await source("data/seed-questions.json"));
  assert.equal(questions.length, 100);

  const counts = new Map();
  const sourceNumbers = new Set();
  const duplicateGroups = new Set();
  for (const question of questions) {
    counts.set(question.subject, (counts.get(question.subject) ?? 0) + 1);
    sourceNumbers.add(question.source_no);
    duplicateGroups.add(question.duplicate_group);
    assert.equal(question.choices.length, 4);
    assert.ok(Number.isInteger(question.answer));
    assert.ok(question.answer >= 1 && question.answer <= 4);
    assert.equal(question.needs_review, false);
    assert.ok(question.confidence >= 0.96);
    assert.ok(question.stem.length > 0);
    assert.ok(question.explanation.length >= 100);
    assert.match(question.explanation, /①/);
    assert.match(question.explanation, /오답 포인트/);
    assert.match(question.duplicate_group, /^2025-1-q\d{3}$/);
  }

  assert.equal(counts.size, 5);
  for (const count of counts.values()) assert.equal(count, 20);
  assert.deepEqual([...sourceNumbers].sort((a, b) => a - b),
    Array.from({ length: 100 }, (_, index) => index + 1));
  assert.equal(duplicateGroups.size, 100);
});

test("provides every API route and both persistence bindings", async () => {
  const routes = [
    "app/api/dashboard/route.ts",
    "app/api/exams/route.ts",
    "app/api/exams/[id]/route.ts",
    "app/api/exams/[id]/answer/route.ts",
    "app/api/exams/[id]/check/route.ts",
    "app/api/exams/[id]/submit/route.ts",
    "app/api/study-items/route.ts",
    "app/api/review/route.ts",
    "app/api/offline-pack/route.ts",
  ];
  await Promise.all(routes.map((route) => access(new URL(route, root))));

  const hosting = JSON.parse(await source(".openai/hosting.json"));
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "QUESTION_ASSETS");
});

test("gates the full exam on 100 answerable unique families and exposes subject ranges", async () => {
  const [dashboardRoute, createRoute, examRoute] = await Promise.all([
    source("app/api/dashboard/route.ts"),
    source("app/api/exams/route.ts"),
    source("app/api/exams/[id]/route.ts"),
  ]);

  assert.match(dashboardRoute, /COUNT\(DISTINCT CASE/);
  assert.match(dashboardRoute, /q\.answer_index IS NOT NULL/);
  assert.match(dashboardRoute, /THEN q\.duplicate_group_id/);
  assert.match(dashboardRoute, /fullExamReady: fullExamShortages\.length === 0/);
  assert.match(dashboardRoute, /policy: "verified_unique_with_answer_only"/);
  assert.match(dashboardRoute, /startPosition: index \* targetPerSubject \+ 1/);
  assert.match(createRoute, /mode === "full"\s*\? 20/);
  assert.match(createRoute, /for \(const subject of SUBJECTS\)/);
  assert.match(createRoute, /selected\.push/);
  assert.match(createRoute, /position \+ 1/);
  assert.match(createRoute, /subjectSections: buildSubjectSections\(requestedPerSubject\)/);
  assert.match(examRoute, /return Response\.json\(\{ session, questions, subjectSections \}\)/);
});

test("locks checked answers and reports official five-subject scoring", async () => {
  const [
    createRoute,
    examRoute,
    answerRoute,
    checkRoute,
    submitRoute,
    examWorkspace,
    offlineWorkspace,
    types,
  ] = await Promise.all([
      source("app/api/exams/route.ts"),
      source("app/api/exams/[id]/route.ts"),
      source("app/api/exams/[id]/answer/route.ts"),
      source("app/api/exams/[id]/check/route.ts"),
      source("app/api/exams/[id]/submit/route.ts"),
      source("components/ExamWorkspace.tsx"),
      source("components/OfflineWorkspace.tsx"),
      source("lib/types.ts"),
    ]);

  assert.match(answerRoute, /AND is_correct IS NULL/);
  assert.match(answerRoute, /정답을 확인한 문항은 답안을 변경할 수 없습니다/);
  assert.match(checkRoute, /json_extract\(snapshot_json, '\$\.answerIndex'\)/);
  assert.match(checkRoute, /is_correct IS NULL/);
  assert.match(checkRoute, /toCheckedResponse/);
  assert.match(checkRoute, /answerIndex: Number\(snapshot\.answerIndex\)/);
  assert.match(checkRoute, /explanation: snapshot\.explanation/);
  assert.match(examRoute, /const checked = row\.is_correct !== null/);
  assert.match(examRoute, /\.\.\.\(checked/);
  assert.match(types, /checked: boolean/);
  assert.match(types, /answerIndex\?: number/);
  assert.match(submitRoute, /Number\(session\.total_questions\) === 100/);
  assert.match(submitRoute, /subject\.total === 20/);
  assert.match(submitRoute, /subject\.score < 40/);
  assert.match(submitRoute, /overallAverage >= 60/);
  assert.match(submitRoute, /minimumSubjectScore: 40/);
  assert.match(submitRoute, /passingAverage: 60/);
  assert.match(submitRoute, /SET status = 'submitting'/);
  assert.match(submitRoute, /WHERE id = \? AND status = 'in_progress'/);
  assert.match(createRoute, /uniqueRows\.length < requestedPerSubject/);
  assert.match(examWorkspace, /aria-label="이전 문제"/);
  assert.match(examWorkspace, /aria-label="다음 문제"/);
  assert.match(examWorkspace, /정답 확인/);
  assert.match(examWorkspace, /해설 닫기/);
  assert.match(examWorkspace, /officialResult\.evaluated/);
  assert.match(examWorkspace, /\[exam\?\.session\.id, result\]/);
  assert.match(examWorkspace, /setElapsed\(\(value\) => value \+ 1\)/);
  assert.match(examWorkspace, /정답 확인됨/);
  assert.match(examWorkspace, /ArrowRight/);
  assert.match(examWorkspace, /answerSavePromiseRef/);
  assert.match(examWorkspace, /pendingSave && !\(await pendingSave\)/);
  assert.match(examWorkspace, /currentSubjectQuestions\.map/);
  assert.match(examWorkspace, /question-subject-tabs/);
  assert.match(offlineWorkspace, /uniqueFamilies/);
  assert.match(offlineWorkspace, /shuffled\(candidates\)\.slice/);
  assert.match(offlineWorkspace, /checkedQuestionIds/);
  assert.match(offlineWorkspace, /subject\.score < 40/);
  assert.match(offlineWorkspace, /averageScore >= 60/);
  assert.match(offlineWorkspace, /await saveOfflineSession\(nextSession\)/);
  assert.match(offlineWorkspace, /navigator\.storage\?\.persist/);
  assert.match(offlineWorkspace, /미응답은 오답으로 채점됩니다/);
  assert.match(offlineWorkspace, /currentSubjectQuestions\.map/);
  assert.match(offlineWorkspace, /question-subject-tabs/);
  assert.doesNotMatch(offlineWorkspace, /session\.currentIndex \+ 1\} \/ \{examQuestions\.length/);
});

test("renders stacked fractions and structured explanations without a math dependency", async () => {
  const [formulaText, onlineWorkspace, offlineWorkspace] = await Promise.all([
    source("components/FormulaText.tsx"),
    source("components/ExamWorkspace.tsx"),
    source("components/OfflineWorkspace.tsx"),
  ]);

  assert.match(formulaText, /<mfrac>/);
  assert.match(formulaText, /aria-label=\{`\$\{numerator\} 나누기 \$\{denominator\}`\}/);
  assert.ok(formulaText.includes("[\\\\/÷]"));
  assert.match(formulaText, /오답 포인트/);
  assert.match(onlineWorkspace, /<FormulaText text=\{question\.stem\}/);
  assert.match(onlineWorkspace, /<ExplanationText text=\{question\.explanation/);
  assert.match(offlineWorkspace, /<FormulaText text=\{currentQuestion\.stem\}/);
  assert.match(offlineWorkspace, /<ExplanationText text=\{currentQuestion\.explanation/);
});

test("ships a versioned D1-backed offline problem pack without user attempts", async () => {
  const [route, types] = await Promise.all([
    source("app/api/offline-pack/route.ts"),
    source("lib/types.ts"),
  ]);

  assert.match(route, /ensureDatabase\(\)/);
  assert.match(route, /q\.review_status = 'verified'/);
  assert.match(route, /q\.answer_index IS NOT NULL/);
  assert.match(route, /contentVersion/);
  assert.match(route, /assetManifest/);
  assert.doesNotMatch(route, /seed-questions\.json/);
  assert.doesNotMatch(route, /FROM attempts/);
  assert.doesNotMatch(route, /FROM exam_sessions/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(types, /schemaVersion: 1/);
  assert.match(types, /answerIndex: number/);
  assert.match(types, /assets: OfflinePackAsset\[\]/);
});

test("provides installable PWA shell and IndexedDB local exam persistence", async () => {
  const [
    manifest,
    worker,
    onlineExam,
    offlinePage,
    offlineDatabase,
    scratchpad,
    scratchpadDatabase,
    styles,
    shell,
  ] = await Promise.all([
    source("public/manifest.webmanifest"),
    source("public/sw.js"),
    source("components/ExamWorkspace.tsx"),
    source("components/OfflineWorkspace.tsx"),
    source("lib/offline-db.ts"),
    source("components/PencilScratchpad.tsx"),
    source("lib/scratchpad-db.ts"),
    source("app/globals.css"),
    source("components/AppShell.tsx"),
  ]);

  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.display, "standalone");
  assert.equal(parsedManifest.start_url, "/offline");
  assert.match(worker, /const RELEASE_ID = "2026-07-15-offline-v5"/);
  assert.match(worker, /const SHELL_CACHE = `jeonsangi-shell-\$\{RELEASE_ID\}`/);
  assert.match(worker, /const PACK_CACHE = `jeonsangi-pack-\$\{RELEASE_ID\}`/);
  assert.match(worker, /cache\.addAll\(APP_SHELL\)/);
  assert.match(worker, /caches\.open\(PACK_CACHE\)/);
  assert.doesNotMatch(worker, /skipWaiting/);
  assert.match(offlineDatabase, /indexedDB\.open/);
  assert.match(offlineDatabase, /saveOfflineSession/);
  assert.match(offlineDatabase, /getOfflinePackByVersion/);
  assert.match(offlineDatabase, /completeOfflineExam/);
  assert.match(offlineDatabase, /database\.transaction\(\[ATTEMPTS_STORE, SESSIONS_STORE\], "readwrite"\)/);
  assert.doesNotMatch(offlineDatabase, /objectStore\(PACKS_STORE\)\.clear\(\)/);
  assert.match(offlineDatabase, /deleteOfflineData/);
  assert.ok(
    offlinePage.indexOf("await completeOfflineExam(attempt)") <
      offlinePage.indexOf("setResult(nextResult)"),
  );
  assert.match(offlinePage, /startExam\(20\)/);
  assert.match(offlinePage, /개인 학습용/);
  assert.match(onlineExam, /PencilScratchpad/);
  assert.match(offlinePage, /PencilScratchpad/);
  assert.match(scratchpad, /onPointerDown/);
  assert.match(scratchpad, /getCoalescedEvents/);
  assert.match(scratchpad, /setPointerCapture/);
  assert.match(scratchpad, /devicePixelRatio/);
  assert.match(scratchpad, /touch-action: none/);
  assert.match(scratchpadDatabase, /indexedDB\.open/);
  assert.match(scratchpadDatabase, /writeQueues/);
  assert.match(styles, /max-width: 1366px/);
  assert.match(styles, /has-pencil-scratchpad/);
  assert.match(shell, /href: "\/offline"/);
});
