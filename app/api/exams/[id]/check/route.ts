import { ensureDatabase, getD1 } from "../../../../../db/runtime";

type CheckedItemRow = {
  item_id: string;
  selected_index: number | null;
  is_correct: number | null;
  snapshot_json: string;
  status: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as {
      itemId?: string;
    };
    if (!payload.itemId) {
      return Response.json({ error: "문항 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const database = getD1();
    let item = await readItem(database, id, payload.itemId);
    if (!item) {
      return Response.json({ error: "문항을 찾을 수 없습니다." }, { status: 404 });
    }

    if (item.is_correct !== null) {
      return Response.json(toCheckedResponse(item));
    }
    if (item.status !== "in_progress") {
      return Response.json({ error: "이미 제출된 시험입니다." }, { status: 409 });
    }
    if (item.selected_index === null) {
      return Response.json(
        { error: "먼저 답안을 선택해 주세요." },
        { status: 409 },
      );
    }

    await database
      .prepare(
        `UPDATE exam_items
         SET is_correct = CASE
               WHEN selected_index = CAST(json_extract(snapshot_json, '$.answerIndex') AS INTEGER)
                 THEN 1
               ELSE 0
             END,
             answered_at = CURRENT_TIMESTAMP
         WHERE id = ? AND exam_session_id = ?
           AND selected_index IS NOT NULL
           AND is_correct IS NULL
           AND EXISTS (
             SELECT 1 FROM exam_sessions
             WHERE id = ? AND status = 'in_progress'
           )`,
      )
      .bind(payload.itemId, id, id)
      .run();

    item = await readItem(database, id, payload.itemId);
    if (!item) {
      return Response.json({ error: "문항을 찾을 수 없습니다." }, { status: 404 });
    }
    if (item.is_correct === null) {
      return Response.json(
        { error: "정답을 확인할 수 없는 시험 상태입니다." },
        { status: 409 },
      );
    }

    return Response.json(toCheckedResponse(item));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "정답을 확인하지 못했습니다." },
      { status: 500 },
    );
  }
}

async function readItem(
  database: D1Database,
  examId: string,
  itemId: string,
) {
  return database
    .prepare(
      `SELECT ei.id AS item_id, ei.selected_index, ei.is_correct,
        ei.snapshot_json, es.status
       FROM exam_items ei
       JOIN exam_sessions es ON es.id = ei.exam_session_id
       WHERE ei.id = ? AND ei.exam_session_id = ?`,
    )
    .bind(itemId, examId)
    .first<CheckedItemRow>();
}

function toCheckedResponse(item: CheckedItemRow) {
  const snapshot = JSON.parse(item.snapshot_json) as {
    answerIndex: number;
    explanation: string;
  };
  return {
    checked: true,
    itemId: item.item_id,
    selectedIndex:
      item.selected_index === null ? null : Number(item.selected_index),
    isCorrect: Boolean(item.is_correct),
    answerIndex: Number(snapshot.answerIndex),
    explanation: snapshot.explanation,
  };
}
