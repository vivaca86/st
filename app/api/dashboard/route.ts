import { ensureDatabase, getD1 } from "../../../db/runtime";

type SubjectSummaryRow = {
  code: string;
  name: string;
  display_order: number;
  question_count: number;
  verified_count: number;
  review_count: number;
  important_count: number;
};

export async function GET() {
  try {
    await ensureDatabase();
    const database = getD1();
    const subjectRows = await database
      .prepare(
        `SELECT
          s.code,
          s.name,
          s.display_order,
          COUNT(q.id) AS question_count,
          COALESCE(SUM(CASE WHEN q.review_status = 'verified' THEN 1 ELSE 0 END), 0) AS verified_count,
          COALESCE(SUM(CASE WHEN q.review_status = 'needs_review' THEN 1 ELSE 0 END), 0) AS review_count,
          COALESCE(SUM(CASE WHEN q.importance_score > 0 THEN 1 ELSE 0 END), 0) AS important_count
        FROM subjects s
        LEFT JOIN questions q ON q.subject_code = s.code
        GROUP BY s.code, s.name, s.display_order
        ORDER BY s.display_order`,
      )
      .all<SubjectSummaryRow>();

    const formulaCount = await database
      .prepare(`SELECT COUNT(*) AS count FROM study_items`)
      .first<{ count: number }>();
    const history = await database
      .prepare(
        `SELECT id, mode, status, total_questions, correct_count,
          started_at, submitted_at
         FROM exam_sessions
         ORDER BY started_at DESC
         LIMIT 3`,
      )
      .all();

    const subjects = subjectRows.results.map((row) => ({
      code: row.code,
      name: row.name,
      displayOrder: Number(row.display_order),
      questionCount: Number(row.question_count),
      verifiedCount: Number(row.verified_count),
      reviewCount: Number(row.review_count),
      importantCount: Number(row.important_count),
    }));

    return Response.json({
      subjects,
      targetPerSubject: 20,
      verifiedTotal: subjects.reduce((sum, row) => sum + row.verifiedCount, 0),
      formulaCount: Number(formulaCount?.count ?? 0),
      fullExamReady: subjects.every((row) => row.verifiedCount >= 20),
      history: history.results,
      ingestion: {
        verifiedSeed: 25,
        reviewQueue: 644,
        estimatedUniqueQuestions: 2982,
        handwritingMapped: 846,
        handwritingTotal: 877,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "현황을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
