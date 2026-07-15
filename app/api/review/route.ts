import { ensureDatabase, getD1 } from "../../../db/runtime";

export async function GET() {
  try {
    await ensureDatabase();
    const database = getD1();
    const reviewRows = await database
      .prepare(
        `SELECT q.id, q.subject_code, q.source_page, q.source_question_no,
          q.stem, q.ocr_confidence, q.importance_score, q.importance_reason,
          sd.title AS source_document
         FROM questions q
         LEFT JOIN source_documents sd ON sd.id = q.source_document_id
         WHERE q.review_status = 'needs_review' OR q.importance_score > 0
         ORDER BY q.importance_score DESC, q.ocr_confidence DESC
         LIMIT 100`,
      )
      .all();
    const markCount = await database
      .prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN reviewed = 0 THEN 1 ELSE 0 END) AS pending
         FROM importance_marks`,
      )
      .first<{ total: number; pending: number }>();

    return Response.json({
      queue: reviewRows.results,
      markCount: Number(markCount?.total ?? 0),
      pendingMarkCount: Number(markCount?.pending ?? 0),
      mapping: {
        matchedPages: 846,
        handwritingPages: 877,
        coverage: 96.47,
      },
      confirmedExamples: [
        { document: "전기기기/1.직류기", page: 6, questions: "25~28", note: "25·26번 + 중요" },
        { document: "전기기기/2.동기기", page: 8, questions: "35~38", note: "35~38번 + 4~5번 나옴" },
        { document: "전기기기/3.변압기", page: 10, questions: "43~46", note: "44~46번 + 자주나옴" },
        { document: "회로이론/5.대칭좌표법", page: 2, questions: "3~6", note: "3~6번 + 시험 잘나옴" },
      ],
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "검수 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
