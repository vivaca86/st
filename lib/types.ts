export type SeedQuestion = {
  subject: string;
  source_doc: string;
  source_page: number;
  source_no: number | string;
  stem: string;
  choices: string[];
  answer: number | string | null;
  explanation: string;
  confidence: number;
  needs_review: boolean;
  duplicate_group?: string;
  formula_keys?: string[];
  importance_reason?: string;
  importance_score?: number;
};

export type DashboardSubject = {
  code: string;
  name: string;
  displayOrder: number;
  questionCount: number;
  verifiedCount: number;
  reviewCount: number;
  importantCount: number;
};

export type ExamQuestion = {
  itemId: string;
  questionId: string;
  position: number;
  subjectCode: string;
  sourceDocument: string;
  sourcePage: number | null;
  sourceQuestionNo: string | null;
  stem: string;
  choices: string[];
  selectedIndex: number | null;
};

export type StudyItemDto = {
  id: string;
  subjectCode: string | null;
  kind: "formula" | "theory";
  title: string;
  prompt: string;
  content: string;
  aliases: string[];
  conditions: string | null;
  units: string | null;
  caution: string | null;
  frequency: number;
  importanceCount: number;
};
