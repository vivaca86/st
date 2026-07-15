export const SUBJECTS = [
  { code: "electromagnetics", name: "전기자기학", shortName: "자기", order: 1 },
  { code: "electric-machines", name: "전기기기", shortName: "기기", order: 2 },
  { code: "power-engineering", name: "전력공학", shortName: "전력", order: 3 },
  { code: "circuit-theory", name: "회로이론", shortName: "회로", order: 4 },
  {
    code: "electrical-regulations",
    name: "전기설비기술기준",
    shortName: "설비",
    order: 5,
  },
] as const;

export type SubjectCode = (typeof SUBJECTS)[number]["code"];

export function subjectCodeFromName(value: string): SubjectCode | null {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  const subject = SUBJECTS.find(
    (item) =>
      item.name.replace(/\s+/g, "").toLowerCase() === normalized ||
      item.code === value,
  );
  return subject?.code ?? null;
}

export function subjectName(code: string): string {
  return SUBJECTS.find((subject) => subject.code === code)?.name ?? code;
}
