import { ensureDatabase, getD1 } from "../../../../../db/runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const payload = (await request.json()) as {
      itemId?: string;
      selectedIndex?: number;
    };
    if (!payload.itemId || !Number.isInteger(payload.selectedIndex)) {
      return Response.json({ error: "답안 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const database = getD1();
    const item = await database
      .prepare(
        `SELECT ei.is_correct, ei.snapshot_json, es.status
         FROM exam_items ei
         JOIN exam_sessions es ON es.id = ei.exam_session_id
         WHERE ei.id = ? AND ei.exam_session_id = ?`,
      )
      .bind(payload.itemId, id)
      .first<{
        is_correct: number | null;
        snapshot_json: string;
        status: string;
      }>();
    if (!item) {
      return Response.json({ error: "문항을 찾을 수 없습니다." }, { status: 404 });
    }
    if (item.status !== "in_progress") {
      return Response.json({ error: "이미 제출된 시험입니다." }, { status: 409 });
    }
    if (item.is_correct !== null) {
      return Response.json(
        { error: "정답을 확인한 문항은 답안을 변경할 수 없습니다." },
        { status: 409 },
      );
    }

    const snapshot = JSON.parse(item.snapshot_json) as { choices?: unknown[] };
    const choiceCount = Array.isArray(snapshot.choices) ? snapshot.choices.length : 0;
    if (
      payload.selectedIndex === undefined ||
      payload.selectedIndex < 0 ||
      payload.selectedIndex >= choiceCount
    ) {
      return Response.json({ error: "선택지 번호가 올바르지 않습니다." }, { status: 400 });
    }

    const result = await database
      .prepare(
        `UPDATE exam_items
         SET selected_index = ?, answered_at = CURRENT_TIMESTAMP
         WHERE id = ? AND exam_session_id = ?
           AND is_correct IS NULL
           AND EXISTS (
             SELECT 1 FROM exam_sessions
             WHERE id = ? AND status = 'in_progress'
           )`,
      )
      .bind(payload.selectedIndex, payload.itemId, id, id)
      .run();
    if (!result.meta.changes) {
      return Response.json(
        { error: "정답을 확인했거나 더 이상 답안을 변경할 수 없습니다." },
        { status: 409 },
      );
    }
    return Response.json({ saved: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "답을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
