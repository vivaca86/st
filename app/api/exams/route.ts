import { ensureDatabase, getD1 } from "../../../db/runtime";
import { SUBJECTS } from "../../../lib/subjects";

type QuestionRow = {
  id: string;
  subject_code: string;
  source_page: number | null;
  source_question_no: string | null;
  stem: string;
  choices_json: string;
  answer_index: number;
  explanation: string;
  duplicate_group_id: string;
  importance_score: number;
  source_document: string;
};

type ExamMode = "full" | "sample" | "priority";

export async function GET() {
  try {
    await ensureDatabase();
    const rows = await getD1()
      .prepare(
        `SELECT id, mode, status, total_questions, correct_count,
          started_at, submitted_at
         FROM exam_sessions
         ORDER BY started_at DESC
         LIMIT 20`,
      )
      .all();
    return Response.json({ exams: rows.results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "시험 기록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const payload = (await request.json().catch(() => ({}))) as {
      mode?: ExamMode;
      perSubject?: number;
    };
    const mode: ExamMode = ["full", "sample", "priority"].includes(
      payload.mode ?? "",
    )
      ? (payload.mode as ExamMode)
      : "sample";
    const requestedPerSubject =
      mode === "full"
        ? 20
        : Math.max(1, Math.min(20, Number(payload.perSubject) || 2));

    const database = getD1();
    const seed = crypto.randomUUID();
    const random = createRandom(seed);
    const selected: QuestionRow[] = [];
    const availability: Array<{ code: string; name: string; available: number }> = [];
    const shortages: Array<{
      code: string;
      name: string;
      available: number;
      required: number;
      missing: number;
    }> = [];

    for (const subject of SUBJECTS) {
      const rows = await database
        .prepare(
          `SELECT q.id, q.subject_code, q.source_page, q.source_question_no,
            q.stem, q.choices_json, q.answer_index, q.explanation,
            q.duplicate_group_id, q.importance_score,
            COALESCE(sd.title, '') AS source_document
           FROM questions q
           LEFT JOIN source_documents sd ON sd.id = q.source_document_id
           WHERE q.subject_code = ?
             AND q.review_status = 'verified'
             AND q.answer_index IS NOT NULL
           ORDER BY q.id`,
        )
        .bind(subject.code)
        .all<QuestionRow>();

      const uniqueRows = Array.from(
        new Map(rows.results.map((row) => [row.duplicate_group_id, row])).values(),
      );
      availability.push({
        code: subject.code,
        name: subject.name,
        available: uniqueRows.length,
      });
      if (uniqueRows.length < requestedPerSubject) {
        shortages.push({
          code: subject.code,
          name: subject.name,
          available: uniqueRows.length,
          required: requestedPerSubject,
          missing: requestedPerSubject - uniqueRows.length,
        });
        continue;
      }

      selected.push(
        ...weightedPick(
          uniqueRows,
          Math.min(requestedPerSubject, uniqueRows.length),
          random,
          mode === "priority",
        ),
      );
    }

    if (shortages.length > 0) {
      return Response.json(
        {
          error:
            mode === "full"
              ? "검수 완료 문제가 과목당 20개에 아직 도달하지 않았습니다."
              : "일부 과목의 검수 완료 문제가 요청한 출제 수보다 적습니다.",
          code: "NOT_ENOUGH_VERIFIED_QUESTIONS",
          shortages,
          availableUniqueTotal: availability.reduce(
            (sum, subject) => sum + subject.available,
            0,
          ),
          requiredTotal: requestedPerSubject * SUBJECTS.length,
          subjectSections: buildSubjectSections(requestedPerSubject),
          policy: "verified_unique_with_answer_only",
        },
        { status: 409 },
      );
    }

    if (selected.length === 0) {
      return Response.json(
        { error: "출제 가능한 검수 완료 문제가 없습니다." },
        { status: 409 },
      );
    }

    const sessionId = crypto.randomUUID();
    await database
      .prepare(
        `INSERT INTO exam_sessions
          (id, mode, seed, status, total_questions)
         VALUES (?, ?, ?, 'in_progress', ?)`,
      )
      .bind(sessionId, mode, seed, selected.length)
      .run();

    await database.batch(
      selected.map((question, position) => {
        const choices = safeStringArray(question.choices_json);
        const snapshot = {
          stem: question.stem,
          choices,
          answerIndex: Number(question.answer_index),
          explanation: question.explanation,
          sourceDocument: question.source_document,
          sourcePage: question.source_page,
          sourceQuestionNo: question.source_question_no,
        };
        return database
          .prepare(
            `INSERT INTO exam_items (
              id, exam_session_id, question_id, subject_code, position,
              duplicate_group_id, choice_order_json, snapshot_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            sessionId,
            question.id,
            question.subject_code,
            position + 1,
            question.duplicate_group_id,
            JSON.stringify(choices.map((_, index) => index)),
            JSON.stringify(snapshot),
          );
      }),
    );

    return Response.json(
      {
        sessionId,
        totalQuestions: selected.length,
        mode,
        subjectSections: buildSubjectSections(requestedPerSubject),
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "시험을 만들지 못했습니다." },
      { status: 500 },
    );
  }
}

function buildSubjectSections(perSubject: number) {
  return SUBJECTS.map((subject, index) => ({
    code: subject.code,
    name: subject.name,
    order: subject.order,
    startPosition: index * perSubject + 1,
    endPosition: (index + 1) * perSubject,
    questionCount: perSubject,
  }));
}

function weightedPick(
  rows: QuestionRow[],
  count: number,
  random: () => number,
  priorityMode: boolean,
) {
  const pool = [...rows];
  const picked: QuestionRow[] = [];
  while (pool.length > 0 && picked.length < count) {
    const weights = pool.map((row) =>
      priorityMode ? 1 + Math.max(0, Number(row.importance_score)) * 3 : 1,
    );
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = random() * total;
    let selectedIndex = 0;
    for (let index = 0; index < weights.length; index += 1) {
      cursor -= weights[index];
      if (cursor <= 0) {
        selectedIndex = index;
        break;
      }
    }
    picked.push(pool.splice(selectedIndex, 1)[0]);
  }
  return picked;
}

function createRandom(seed: string) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function safeStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
