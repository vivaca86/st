import { ensureDatabase, getD1 } from "../../../../db/runtime";

type ExamItemRow = {
  item_id: string;
  question_id: string;
  position: number;
  subject_code: string;
  selected_index: number | null;
  snapshot_json: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const database = getD1();
    const session = await database
      .prepare(
        `SELECT id, mode, status, total_questions, correct_count,
          started_at, submitted_at
         FROM exam_sessions WHERE id = ?`,
      )
      .bind(id)
      .first();
    if (!session) {
      return Response.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    }

    const itemRows = await database
      .prepare(
        `SELECT id AS item_id, question_id, position, subject_code,
          selected_index, snapshot_json
         FROM exam_items
         WHERE exam_session_id = ?
         ORDER BY position`,
      )
      .bind(id)
      .all<ExamItemRow>();

    const questions = itemRows.results.map((row) => {
      const snapshot = JSON.parse(row.snapshot_json) as {
        stem: string;
        choices: string[];
        sourceDocument: string;
        sourcePage: number | null;
        sourceQuestionNo: string | null;
      };
      return {
        itemId: row.item_id,
        questionId: row.question_id,
        position: Number(row.position),
        subjectCode: row.subject_code,
        selectedIndex:
          row.selected_index === null ? null : Number(row.selected_index),
        sourceDocument: snapshot.sourceDocument,
        sourcePage: snapshot.sourcePage,
        sourceQuestionNo: snapshot.sourceQuestionNo,
        stem: snapshot.stem,
        choices: snapshot.choices,
      };
    });

    return Response.json({ session, questions });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "시험을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
