import { ensureDatabase, getD1 } from "../../../../../db/runtime";
import { SUBJECTS } from "../../../../../lib/subjects";

type SubmitRow = {
  item_id: string;
  question_id: string;
  subject_code: string;
  position: number;
  selected_index: number | null;
  snapshot_json: string;
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const database = getD1();
    const session = await database
      .prepare(`SELECT status, mode, total_questions FROM exam_sessions WHERE id = ?`)
      .bind(id)
      .first<{ status: string; mode: string; total_questions: number }>();
    if (!session) {
      return Response.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    }
    if (session.status !== "in_progress") {
      return Response.json({ error: "이미 제출한 시험입니다." }, { status: 409 });
    }

    const claim = await database
      .prepare(
        `UPDATE exam_sessions
         SET status = 'submitting'
         WHERE id = ? AND status = 'in_progress'`,
      )
      .bind(id)
      .run();
    if (!claim.meta.changes) {
      return Response.json({ error: "이미 제출 중이거나 제출한 시험입니다." }, { status: 409 });
    }

    let submissionFinished = false;
    try {
      const itemRows = await database
        .prepare(
          `SELECT id AS item_id, question_id, subject_code, position,
            selected_index, snapshot_json
           FROM exam_items
           WHERE exam_session_id = ?
           ORDER BY position`,
        )
        .bind(id)
        .all<SubmitRow>();

      const results = itemRows.results.map((row) => {
        const snapshot = JSON.parse(row.snapshot_json) as {
          stem: string;
          choices: string[];
          answerIndex: number;
          explanation: string;
          sourceDocument: string;
          sourcePage: number | null;
          sourceQuestionNo: string | null;
        };
        const selectedIndex =
          row.selected_index === null ? null : Number(row.selected_index);
        const isCorrect = selectedIndex === Number(snapshot.answerIndex);
        return {
          itemId: row.item_id,
          questionId: row.question_id,
          subjectCode: row.subject_code,
          position: Number(row.position),
          selectedIndex,
          isCorrect,
          ...snapshot,
        };
      });
      const correctCount = results.filter((row) => row.isCorrect).length;

      const scoreBySubject = results.reduce<
        Record<string, { correct: number; total: number }>
      >((accumulator, row) => {
        accumulator[row.subjectCode] ??= { correct: 0, total: 0 };
        accumulator[row.subjectCode].total += 1;
        if (row.isCorrect) accumulator[row.subjectCode].correct += 1;
        return accumulator;
      }, {});
      const baseSubjectScores = SUBJECTS.map((subject) => {
        const counts = scoreBySubject[subject.code] ?? { correct: 0, total: 0 };
        return {
          code: subject.code,
          name: subject.name,
          correct: counts.correct,
          total: counts.total,
          score: counts.total
            ? Math.round((counts.correct / counts.total) * 100)
            : 0,
          pointsPerQuestion: counts.total ? 100 / counts.total : 0,
        };
      });
      const isOfficialFullExam =
        session.mode === "full" &&
        Number(session.total_questions) === 100 &&
        results.length === 100 &&
        baseSubjectScores.every((subject) => subject.total === 20);
      const subjectScores = baseSubjectScores.map((subject) => ({
        ...subject,
        isFailed: isOfficialFullExam ? subject.score < 40 : null,
      }));
      const overallAverage = subjectScores.length
        ? Math.round(
            (subjectScores.reduce((sum, subject) => sum + subject.score, 0) /
              subjectScores.length) *
              10,
          ) / 10
        : 0;
      const hasSubjectFailure = isOfficialFullExam
        ? subjectScores.some((subject) => subject.score < 40)
        : null;
      const passed = isOfficialFullExam
        ? overallAverage >= 60 && hasSubjectFailure === false
        : null;

      const statements = results.flatMap((row) => [
        database
          .prepare(
            `UPDATE exam_items SET is_correct = ?
             WHERE id = ? AND exam_session_id = ?`,
          )
          .bind(row.isCorrect ? 1 : 0, row.itemId, id),
        database
          .prepare(
            `INSERT INTO attempts
              (id, exam_session_id, question_id, selected_index, is_correct)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            id,
            row.questionId,
            row.selectedIndex,
            row.isCorrect ? 1 : 0,
          ),
      ]);
      statements.push(
        database
          .prepare(
            `UPDATE exam_sessions
             SET status = 'submitted', correct_count = ?, submitted_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'submitting'`,
          )
          .bind(correctCount, id),
      );
      await database.batch(statements);
      submissionFinished = true;

      return Response.json({
        correctCount,
        totalQuestions: results.length,
        score: results.length ? Math.round((correctCount / results.length) * 100) : 0,
        overallAverage,
        subjectScores,
        officialResult: {
          evaluated: isOfficialFullExam,
          passed,
          hasSubjectFailure,
          minimumSubjectScore: 40,
          passingAverage: 60,
        },
        results,
      });
    } finally {
      if (!submissionFinished) {
        await database
          .prepare(
            `UPDATE exam_sessions
             SET status = 'in_progress'
             WHERE id = ? AND status = 'submitting'`,
          )
          .bind(id)
          .run();
      }
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "채점하지 못했습니다." },
      { status: 500 },
    );
  }
}
