import { ensureDatabase, getD1 } from "../../../db/runtime";

type SubjectSummaryRow = {
  code: string;
  name: string;
  display_order: number;
  question_count: number;
  verified_count: number;
  ready_unique_count: number;
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
          COUNT(DISTINCT CASE
            WHEN q.review_status = 'verified' AND q.answer_index IS NOT NULL
              THEN q.duplicate_group_id
            END) AS ready_unique_count,
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
      readyUniqueCount: Number(row.ready_unique_count),
      reviewCount: Number(row.review_count),
      importantCount: Number(row.important_count),
    }));

    const targetPerSubject = 20;
    const fullExamShortages = subjects.flatMap((subject) => {
      const missing = Math.max(0, targetPerSubject - subject.readyUniqueCount);
      return missing > 0
        ? [
            {
              code: subject.code,
              name: subject.name,
              available: subject.readyUniqueCount,
              required: targetPerSubject,
              missing,
            },
          ]
        : [];
    });
    const subjectSections = subjects.map((subject, index) => ({
      code: subject.code,
      name: subject.name,
      order: subject.displayOrder,
      startPosition: index * targetPerSubject + 1,
      endPosition: (index + 1) * targetPerSubject,
      questionCount: targetPerSubject,
    }));
    const readyUniqueTotal = subjects.reduce(
      (sum, subject) => sum + subject.readyUniqueCount,
      0,
    );
    const verifiedTotal = subjects.reduce(
      (sum, subject) => sum + subject.verifiedCount,
      0,
    );

    return Response.json({
      subjects,
      targetPerSubject,
      verifiedTotal,
      readyUniqueTotal,
      formulaCount: Number(formulaCount?.count ?? 0),
      fullExamReady: fullExamShortages.length === 0,
      fullExam: {
        requiredTotal: targetPerSubject * subjects.length,
        requiredPerSubject: targetPerSubject,
        availableUniqueTotal: readyUniqueTotal,
        missingUniqueTotal: fullExamShortages.reduce(
          (sum, shortage) => sum + shortage.missing,
          0,
        ),
        shortages: fullExamShortages,
        subjectSections,
        policy: "verified_unique_with_answer_only",
      },
      history: history.results,
      ingestion: {
        verifiedSeed: verifiedTotal,
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
