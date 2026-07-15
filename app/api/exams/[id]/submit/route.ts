import { ensureDatabase, getD1 } from "../../../../../db/runtime";

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
      .prepare(`SELECT status FROM exam_sessions WHERE id = ?`)
      .bind(id)
      .first<{ status: string }>();
    if (!session) {
      return Response.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    }
    if (session.status !== "in_progress") {
      return Response.json({ error: "이미 제출한 시험입니다." }, { status: 409 });
    }

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
           WHERE id = ?`,
        )
        .bind(correctCount, id),
    );
    await database.batch(statements);

    const subjectScores = Object.values(
      results.reduce<Record<string, { code: string; correct: number; total: number }>>(
        (accumulator, row) => {
          accumulator[row.subjectCode] ??= {
            code: row.subjectCode,
            correct: 0,
            total: 0,
          };
          accumulator[row.subjectCode].total += 1;
          if (row.isCorrect) accumulator[row.subjectCode].correct += 1;
          return accumulator;
        },
        {},
      ),
    );

    return Response.json({
      correctCount,
      totalQuestions: results.length,
      score: results.length ? Math.round((correctCount / results.length) * 100) : 0,
      subjectScores,
      results,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "채점하지 못했습니다." },
      { status: 500 },
    );
  }
}
