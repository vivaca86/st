import type { Metadata } from "next";
import { ImportanceReview } from "../../components/ImportanceReview";

export const metadata: Metadata = {
  title: "중요문제 검수",
};

export default function ReviewPage() {
  return <ImportanceReview />;
}
