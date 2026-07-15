import { Fragment, type ReactNode } from "react";
import styles from "./FormulaText.module.css";

type TextProps = {
  text: string;
  className?: string;
};

const SCRIPT = "₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹";
const LETTER = "A-Za-zΑ-Ωα-ωℓ";
const NUMBER_ATOM = `\\d+(?:\\.\\d+)?(?:[${LETTER}]+)?[${SCRIPT}]*`;
const SYMBOL_ATOM = `[${LETTER}]+(?:\\d+)?[${SCRIPT}]*`;
const FUNCTION_ATOM = `(?:sin|cos|tan)\\s*(?:\\d+(?:\\.\\d+)?°?|[${LETTER}]+)`;
const RADICAL_ATOM = `√(?:\\([^()\\n]{1,40}\\)|${NUMBER_ATOM}|${SYMBOL_ATOM})`;
const GROUP_ATOM = `\\([^()\\n]{1,40}\\)[${SCRIPT}]*`;
const ATOM = `(?:${FUNCTION_ATOM}|${RADICAL_ATOM}|${GROUP_ATOM}|${NUMBER_ATOM}|${SYMBOL_ATOM})`;
const FRACTION_PATTERN = new RegExp(
  `\\\\frac\\{([^{}]+)\\}\\{([^{}]+)\\}|(${ATOM})\\s*[\\/÷]\\s*(${ATOM})`,
  "g",
);

function Fraction({ numerator, denominator }: { numerator: string; denominator: string }) {
  return (
    <math
      className={styles.fraction}
      aria-label={`${numerator} 나누기 ${denominator}`}
    >
      <mfrac>
        <mtext>{numerator}</mtext>
        <mtext>{denominator}</mtext>
      </mfrac>
    </math>
  );
}

function renderFormulaLine(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = new RegExp(FRACTION_PATTERN.source, "g");
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const numerator = (match[1] ?? match[3]).trim();
    const denominator = (match[2] ?? match[4]).trim();
    nodes.push(
      <Fraction
        key={`${keyPrefix}-fraction-${match.index}`}
        numerator={numerator}
        denominator={denominator}
      />,
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/**
 * Renders compact electrical formulas without a heavy math dependency.
 * Simple a/b atoms and explicit \frac{a}{b} tokens become stacked fractions.
 */
export function FormulaText({ text, className }: TextProps) {
  const lines = text.split(/\r?\n/);
  return (
    <span className={`${styles.formulaText}${className ? ` ${className}` : ""}`}>
      {lines.map((line, index) => (
        <Fragment key={`formula-line-${index}`}>
          {index > 0 && <br />}
          {renderFormulaLine(line, `formula-line-${index}`)}
        </Fragment>
      ))}
    </span>
  );
}

const EXPLANATION_MARKER = /^(풀이 순서|판단 순서|계산 순서|근거|정답 근거|오답 포인트|①|②|③|④)(:)?\s*/;

function markerColor(marker: string) {
  if (marker === "오답 포인트") return "#a84431";
  if (marker === "근거" || marker === "정답 근거") return "#177451";
  return "var(--blue-dark, #174bb4)";
}

/** Structured explanation renderer shared by online and offline review screens. */
export function ExplanationText({ text, className }: TextProps) {
  const lines = text.split(/\r?\n/);
  return (
    <span className={`${styles.explanationText}${className ? ` ${className}` : ""}`}>
      {lines.map((line, index) => {
        const markerMatch = line.match(EXPLANATION_MARKER);
        const marker = markerMatch?.[1];
        const remainder = markerMatch ? line.slice(markerMatch[0].length) : line;
        return (
          <span key={`explanation-line-${index}`} className={styles.explanationLine}>
            {marker && (
              <strong
                className={styles.explanationMarker}
                style={{ color: markerColor(marker) }}
              >
                {marker}{markerMatch?.[2] ? ":" : ""}
              </strong>
            )}
            <FormulaText text={remainder} />
          </span>
        );
      })}
    </span>
  );
}
