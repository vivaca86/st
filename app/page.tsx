import type { Metadata } from "next";
import { Dashboard } from "../components/Dashboard";

export const metadata: Metadata = {
  title: "학습 홈",
};

export default function HomePage() {
  return <Dashboard />;
}
