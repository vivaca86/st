import type { Metadata } from "next";
import { FormulaNotebook } from "../../components/FormulaNotebook";

export const metadata: Metadata = {
  title: "공식·이론 암기노트",
};

export default function FormulasPage() {
  return <FormulaNotebook />;
}
