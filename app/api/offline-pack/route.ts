import { ensureDatabase, getD1 } from "../../../db/runtime";
import { SUBJECTS } from "../../../lib/subjects";
import type { OfflinePack, OfflineQuestion, OfflineStudyItem } from "../../../lib/types";

type QuestionRow = {
  id: string;
  subject_code: string;
  source_document: string | null;
  source_page: number | null;
  source_question_no: string | null;
  stem: string;
  choices_json: string;
  answer_index: number;
  explanation: string;
  duplicate_group_id: string;
  importance_score: number;
  updated_at: string;
};

type StudyRow = {
  id: string;
  subject_code: string | null;
  kind: "formula" | "theory";
  title: string;
  prompt: string;
  content: string;
  canonical_key: string;
  aliases_json: string;
  conditions: string | null;
  units: string | null;
  caution: string | null;
  frequency: number;
  importance_count: number;
};

async function contentVersion(value: unknown) {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const shortHash = Array.from(new Uint8Array(digest).slice(0, 6), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `v1-${shortHash}`;
}

async function createPack(): Promise<OfflinePack> {
  await ensureDatabase();
  const database = getD1();
  const [questionResult, studyResult] = await Promise.all([
    database
      .prepare(
        `SELECT q.id, q.subject_code, sd.title AS source_document,
          q.source_page, q.source_question_no, q.stem, q.choices_json,
          q.answer_index, q.explanation, q.duplicate_group_id,
          q.importance_score, q.updated_at
         FROM questions q
         LEFT JOIN source_documents sd ON sd.id = q.source_document_id
         WHERE q.review_status = 'verified' AND q.answer_index IS NOT NULL
         ORDER BY q.subject_code, q.id`,
      )
      .all<QuestionRow>(),
    database
      .prepare(
        `SELECT si.id, si.subject_code, si.kind, si.title, si.prompt,
          si.content, si.canonical_key, si.aliases_json, si.conditions,
          si.units, si.caution,
          COUNT(DISTINCT q.duplicate_group_id) AS frequency,
          COUNT(DISTINCT CASE WHEN q.importance_score > 0 THEN q.duplicate_group_id END)
            AS importance_count
         FROM study_items si
         JOIN question_study_items qsi ON qsi.study_item_id = si.id
         JOIN questions q ON q.id = qsi.question_id
         WHERE q.review_status = 'verified'
         GROUP BY si.id, si.subject_code, si.kind, si.title, si.prompt,
          si.content, si.canonical_key, si.aliases_json, si.conditions,
          si.units, si.caution
         ORDER BY frequency DESC, importance_count DESC, si.title`,
      )
      .all<StudyRow>(),
  ]);

  const questions: OfflineQuestion[] = questionResult.results.map((row) => ({
    id: row.id,
    subjectCode: row.subject_code,
    sourceDocument: row.source_document ?? "출처 미상",
    sourcePage: row.source_page,
    sourceQuestionNo: row.source_question_no,
    stem: row.stem,
    choices: JSON.parse(row.choices_json) as string[],
    answerIndex: Number(row.answer_index),
    explanation: row.explanation,
    duplicateGroupId: row.duplicate_group_id,
    importanceScore: Number(row.importance_score),
    assetIds: [],
  }));
  const studyItems: OfflineStudyItem[] = studyResult.results.map((row) => ({
    id: row.id,
    subjectCode: row.subject_code,
    kind: row.kind,
    title: row.title,
    prompt: row.prompt,
    content: row.content,
    canonicalKey: row.canonical_key,
    aliases: JSON.parse(row.aliases_json) as string[],
    conditions: row.conditions,
    units: row.units,
    caution: row.caution,
    frequency: Number(row.frequency),
    importanceCount: Number(row.importance_count),
  }));
  const version = await contentVersion({ questions, studyItems });
  const latestUpdate = questionResult.results.reduce(
    (latest, row) => (row.updated_at > latest ? row.updated_at : latest),
    "2026-07-15 00:00:00",
  );

  return {
    schemaVersion: 1,
    version,
    publishedAt: `${latestUpdate.replace(" ", "T")}Z`,
    title: "전산기 100 검증 문제팩",
    minimumAppVersion: "0.1.0",
    subjects: SUBJECTS.map((subject) => ({
      code: subject.code,
      name: subject.name,
      displayOrder: subject.order,
      questionCount: questions.filter((question) => question.subjectCode === subject.code).length,
    })),
    questions,
    studyItems,
    assetManifest: {
      version: 1,
      strategy: "on-demand",
      baseUrl: "/offline-assets/",
      totalBytes: 0,
      assets: [],
    },
  };
}

export async function GET(request: Request) {
  try {
    const pack = await createPack();
    const download = new URL(request.url).searchParams.get("download") === "1";
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Offline-Pack-Version": pack.version,
    });
    if (download) {
      headers.set(
        "Content-Disposition",
        `attachment; filename="jeonsangi-offline-pack-${pack.version}.json"`,
      );
    }
    return new Response(JSON.stringify(pack), { headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "오프라인 문제팩을 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
