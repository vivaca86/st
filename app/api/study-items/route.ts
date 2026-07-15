import { ensureDatabase, getD1 } from "../../../db/runtime";

type StudyRow = {
  id: string;
  subject_code: string | null;
  kind: "formula" | "theory";
  title: string;
  prompt: string;
  content: string;
  aliases_json: string;
  conditions: string | null;
  units: string | null;
  caution: string | null;
  frequency: number;
  importance_count: number;
};

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const subject = url.searchParams.get("subject");
    const conditions: string[] = [];
    const bindings: string[] = [];
    if (kind === "formula" || kind === "theory") {
      conditions.push("kind = ?");
      bindings.push(kind);
    }
    if (subject) {
      conditions.push("subject_code = ?");
      bindings.push(subject);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await getD1()
      .prepare(
        `SELECT id, subject_code, kind, title, prompt, content, aliases_json,
          conditions, units, caution, frequency, importance_count
         FROM study_items
         ${where}
         ORDER BY frequency DESC, importance_count DESC, title`,
      )
      .bind(...bindings)
      .all<StudyRow>();

    return Response.json({
      items: rows.results.map((row) => ({
        id: row.id,
        subjectCode: row.subject_code,
        kind: row.kind,
        title: row.title,
        prompt: row.prompt,
        content: row.content,
        aliases: JSON.parse(row.aliases_json) as string[],
        conditions: row.conditions,
        units: row.units,
        caution: row.caution,
        frequency: Number(row.frequency),
        importanceCount: Number(row.importance_count),
      })),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "암기노트를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
