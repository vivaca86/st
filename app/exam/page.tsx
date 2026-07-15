import type { Metadata } from "next";
import { ExamWorkspace } from "../../components/ExamWorkspace";

export const metadata: Metadata = {
  title: "랜덤 시험",
};

export default function ExamPage() {
  return <ExamWorkspace />;
}
