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
    const result = await database
      .prepare(
        `UPDATE exam_items
         SET selected_index = ?, answered_at = CURRENT_TIMESTAMP
         WHERE id = ? AND exam_session_id = ?
           AND EXISTS (
             SELECT 1 FROM exam_sessions
             WHERE id = ? AND status = 'in_progress'
           )`,
      )
      .bind(payload.selectedIndex, payload.itemId, id, id)
      .run();
    if (!result.meta.changes) {
      return Response.json(
        { error: "제출된 시험이거나 문항을 찾을 수 없습니다." },
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
