"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { subjectName } from "../lib/subjects";
import type { DashboardSubject, ExamQuestion } from "../lib/types";
import { ExplanationText, FormulaText } from "./FormulaText";
import { PencilScratchpad } from "./PencilScratchpad";

type DashboardData = {
  subjects: DashboardSubject[];
  fullExamReady: boolean;
  verifiedTotal: number;
};

type ExamData = {
  session: {
    id: string;
    mode: string;
    status: string;
    total_questions: number;
  };
  questions: ExamQuestionView[];
};

type ExamQuestionView = ExamQuestion & {
  checked?: boolean;
  answerIndex?: number | null;
  isCorrect?: boolean | null;
  explanation?: string | null;
};

type CheckData = {
  itemId: string;
  checked: boolean;
  answerIndex: number;
  isCorrect: boolean;
  explanation: string;
};

type ResultRow = {
  itemId: string;
  questionId: string;
  subjectCode: string;
  position: number;
  selectedIndex: number | null;
  isCorrect: boolean;
  stem: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  sourceDocument: string;
  sourcePage: number | null;
  sourceQuestionNo: string | null;
};

type ResultData = {
  correctCount: number;
  totalQuestions: number;
  score: number;
  overallAverage: number;
  subjectScores: Array<{
    code: string;
    name: string;
    correct: number;
    total: number;
    score: number;
    pointsPerQuestion: number;
    isFailed: boolean | null;
  }>;
  officialResult: {
    evaluated: boolean;
    passed: boolean | null;
    hasSubjectFailure: boolean | null;
    minimumSubjectScore: number;
    passingAverage: number;
  };
  results: ResultRow[];
};

const SUBJECT_SHORT_NAMES: Record<string, string> = {
  electromagnetics: "자기학",
  "electric-machines": "기기",
  "power-engineering": "전력",
  "circuit-theory": "회로",
  "electrical-regulations": "설비",
};

export function ExamWorkspace() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [checkingItemId, setCheckingItemId] = useState<string | null>(null);
  const [openExplanations, setOpenExplanations] = useState<Record<string, boolean>>({});
  const answerSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const checkingItemRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((response) => response.json())
      .then(setDashboard)
      .catch(() => setError("문제은행 현황을 불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    if (!exam?.session.id || result) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [exam?.session.id, result]);

  const answeredCount = useMemo(
    () => exam?.questions.filter((question) => question.selectedIndex !== null).length ?? 0,
    [exam],
  );

  async function startExam(mode: "full" | "sample" | "priority") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, perSubject: mode === "full" ? 20 : 2 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "시험을 만들지 못했습니다.");

      const examResponse = await fetch(`/api/exams/${payload.sessionId}`);
      const examPayload = await examResponse.json();
      if (!examResponse.ok) throw new Error(examPayload.error ?? "시험을 열지 못했습니다.");
      setExam(examPayload as ExamData);
      setResult(null);
      setCurrentIndex(0);
      setElapsed(0);
      setSavingItemId(null);
      setCheckingItemId(null);
      setOpenExplanations({});
      answerSavePromiseRef.current = null;
      checkingItemRef.current = null;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "시험을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function selectChoice(choiceIndex: number) {
    if (!exam || result) return;
    const question = exam.questions[currentIndex];
    if (question.checked || savingItemId !== null || checkingItemRef.current !== null) return;
    const previousSelectedIndex = question.selectedIndex;
    setSavingItemId(question.itemId);
    setError("");
    setExam({
      ...exam,
      questions: exam.questions.map((item, index) =>
        index === currentIndex ? { ...item, selectedIndex: choiceIndex } : item,
      ),
    });
    const savePromise = (async () => {
      try {
        const response = await fetch(`/api/exams/${exam.session.id}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: question.itemId, selectedIndex: choiceIndex }),
        });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error ?? "답을 저장하지 못했습니다.");
        }
        return true;
      } catch (reason) {
        setExam((currentExam) =>
          currentExam
            ? {
                ...currentExam,
                questions: currentExam.questions.map((item) =>
                  item.itemId === question.itemId
                    ? { ...item, selectedIndex: previousSelectedIndex }
                    : item,
                ),
              }
            : currentExam,
        );
        setError(reason instanceof Error ? reason.message : "답을 저장하지 못했습니다.");
        return false;
      } finally {
        setSavingItemId(null);
      }
    })();

    answerSavePromiseRef.current = savePromise;
    await savePromise;
    if (answerSavePromiseRef.current === savePromise) {
      answerSavePromiseRef.current = null;
    }
  }

  async function checkAnswer() {
    if (!exam || result) return;
    const question = exam.questions[currentIndex];
    if (
      question.selectedIndex === null ||
      question.checked ||
      checkingItemRef.current !== null
    ) {
      return;
    }

    checkingItemRef.current = question.itemId;
    setCheckingItemId(question.itemId);
    setError("");
    try {
      const pendingSave = answerSavePromiseRef.current;
      if (pendingSave && !(await pendingSave)) return;

      const response = await fetch(`/api/exams/${exam.session.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: question.itemId }),
      });
      const payload = (await response.json()) as CheckData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "정답을 확인하지 못했습니다.");

      setExam((currentExam) =>
        currentExam
          ? {
              ...currentExam,
              questions: currentExam.questions.map((item) =>
                item.itemId === question.itemId
                  ? {
                      ...item,
                      checked: payload.checked,
                      answerIndex: payload.answerIndex,
                      isCorrect: payload.isCorrect,
                      explanation: payload.explanation,
                    }
                  : item,
              ),
            }
          : currentExam,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "정답을 확인하지 못했습니다.");
    } finally {
      if (checkingItemRef.current === question.itemId) checkingItemRef.current = null;
      setCheckingItemId((current) => (current === question.itemId ? null : current));
    }
  }

  async function submitExam() {
    if (!exam) return;
    const unanswered = exam.questions.length - answeredCount;
    if (unanswered > 0 && !confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/exams/${exam.session.id}/submit`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "채점하지 못했습니다.");
      setResult(payload as ResultData);
      setConfirmSubmit(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "채점하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return <ExamResult result={result} onRestart={() => { setExam(null); setResult(null); }} />;
  }

  if (!exam) {
    return (
      <div className="page-stack exam-setup">
        <section className="page-title-row">
          <div>
            <span className="eyebrow">랜덤 출제</span>
          </div>
          <div className="setup-summary">
            <strong>{dashboard?.verifiedTotal ?? "–"}</strong>
            <span>현재 검수 완료</span>
          </div>
        </section>

        {error && <div className="notice notice-error">{error}</div>}

        <section className="mode-grid">
          <article className="mode-card mode-primary">
            <span className="mode-number">01</span>
            <div>
              <span className="card-kicker">실전 모드</span>
              <h2>5과목 × 20문제</h2>
              <p>실제 시험 구성처럼 총 100문제를 중복 없이 풉니다.</p>
            </div>
            <ul>
              <li>검수 완료 문제만 출제</li>
              <li>정답 확인 뒤 선택 답안 고정</li>
              <li>과목별 점수 자동 분석</li>
            </ul>
            <button
              className="button button-light button-large"
              disabled={!dashboard?.fullExamReady || busy}
              onClick={() => startExam("full")}
            >
              {dashboard?.fullExamReady ? "100문제 시작" : "문제 DB 검수 중"}
            </button>
            {!dashboard?.fullExamReady && (
              <small>각 과목에 검수 문제 20개가 모이면 자동으로 열립니다.</small>
            )}
          </article>

          <article className="mode-card">
            <span className="mode-number">02</span>
            <div>
              <span className="card-kicker">현재 데이터 체험</span>
              <h2>미니 모의고사</h2>
              <p>현재 검수된 문제에서 과목당 2문제, 총 10문제를 뽑습니다.</p>
            </div>
            <ul>
              <li>5과목 균등 구성</li>
              <li>실제 원본 출처 표시</li>
              <li>즉시 채점과 해설</li>
            </ul>
            <button
              className="button button-primary button-large"
              disabled={busy}
              onClick={() => startExam("sample")}
            >
              {busy ? "시험 만드는 중…" : "10문제 시작"}
            </button>
          </article>

          <article className="mode-card">
            <span className="mode-number">03</span>
            <div>
              <span className="card-kicker">빈출 집중</span>
              <h2>중요문제 모드</h2>
              <p>별표, “잘 나옴”, 최근 오답에 가중치를 두고 랜덤 출제합니다.</p>
            </div>
            <ul>
              <li>필기 번호와 문제 번호 연결</li>
              <li>중요도 가중 무복원 추출</li>
              <li>같은 문제 가족은 한 번만</li>
            </ul>
            <button
              className="button button-secondary button-large"
              disabled={busy}
              onClick={() => startExam("priority")}
            >
              중요문제 체험
            </button>
          </article>
        </section>

        <section className="exam-rule-strip">
          <div><b>5</b><span>과목</span></div>
          <i />
          <div><b>20</b><span>과목별 문항</span></div>
          <i />
          <div><b>100</b><span>총 문항</span></div>
          <i />
          <div><b>1회</b><span>중복그룹 제한</span></div>
        </section>
      </div>
    );
  }

  const question = exam.questions[currentIndex];
  const unanswered = exam.questions.length - answeredCount;
  const explanationOpen = Boolean(openExplanations[question.itemId]);
  const subjectNavigation = Array.from(
    new Set(exam.questions.map((item) => item.subjectCode)),
  ).map((code) => {
    const subjectQuestions = exam.questions
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.subjectCode === code);
    const firstUnanswered = subjectQuestions.find(({ item }) => item.selectedIndex === null);
    return {
      code,
      index: firstUnanswered?.index ?? subjectQuestions[0]?.index ?? 0,
      answered: subjectQuestions.filter(({ item }) => item.selectedIndex !== null).length,
      total: subjectQuestions.length,
    };
  });
  const currentSubjectQuestions = exam.questions
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.subjectCode === question.subjectCode);

  return (
    <div className="exam-workspace online-exam">
      <section className="exam-topbar online-exam-topbar">
        <div className="exam-progress-summary">
          <span className="eyebrow">{exam.session.mode === "priority" ? "중요문제" : "랜덤 모의고사"}</span>
        </div>
        <div className="exam-clock" aria-label={`경과 시간 ${formatTime(elapsed)}`}>
          <span>경과 시간</span><b>{formatTime(elapsed)}</b>
        </div>
        <button
          className="button button-dark exam-submit-button"
          onClick={submitExam}
          disabled={busy || savingItemId !== null || checkingItemId !== null}
        >
          <span className="exam-submit-label-full">답안 제출</span>
          <span className="exam-submit-label-mobile">제출</span>
        </button>
      </section>

      {error && <div className="notice notice-error">{error}</div>}
      {confirmSubmit && (
        <div className="notice notice-warning">
          <span>아직 {unanswered}문제가 비어 있습니다. 그대로 제출할까요?</span>
          <div>
            <button onClick={() => setConfirmSubmit(false)}>계속 풀기</button>
            <button
              onClick={submitExam}
              disabled={busy || savingItemId !== null || checkingItemId !== null}
            >
              제출하기
            </button>
          </div>
        </div>
      )}

      <div className="exam-layout has-pencil-scratchpad">
        <aside className="question-map online-question-map">
          <div className="question-map-head">
            <h2>과목·문항</h2><span>{currentSubjectQuestions.length}문제</span>
          </div>
          <div className="question-subject-tabs" aria-label="과목 바로가기">
            {subjectNavigation.map((subject) => (
              <button
                className={subject.code === question.subjectCode ? "is-current" : ""}
                key={subject.code}
                disabled={checkingItemId !== null}
                onClick={() => {
                  setCurrentIndex(subject.index);
                  setConfirmSubmit(false);
                }}
                aria-label={`${subjectName(subject.code)} ${subject.answered}/${subject.total} 답안 선택`}
                aria-current={subject.code === question.subjectCode ? "true" : undefined}
              >
                <strong>{SUBJECT_SHORT_NAMES[subject.code] ?? subjectName(subject.code)}</strong>
                <small>{subject.answered}/{subject.total}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="question-panel">
          <div className="question-meta">
            <span className="subject-pill">{subjectName(question.subjectCode)}</span>
            <span>{question.sourceDocument}</span>
            <span>p.{question.sourcePage ?? "–"}</span>
            {question.sourceQuestionNo && <span>원문 {question.sourceQuestionNo}번</span>}
          </div>
          <div className="question-number">문제 {question.position}</div>
          <h1><FormulaText text={question.stem} /></h1>

          <div className="choice-list" role="radiogroup" aria-label="선택지">
            {question.choices.map((choice, choiceIndex) => {
              const selected = question.selectedIndex === choiceIndex;
              const correctChoice = question.checked && question.answerIndex === choiceIndex;
              const wrongChoice = question.checked && selected && !correctChoice;
              const choiceClassName = [
                selected ? "is-selected" : "",
                correctChoice ? "is-correct" : "",
                wrongChoice ? "is-wrong" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  className={choiceClassName}
                  key={`${question.itemId}-${choiceIndex}`}
                  onClick={() => selectChoice(choiceIndex)}
                  onKeyDown={(event) => {
                    if (question.checked || savingItemId !== null || checkingItemId !== null) return;
                    let nextIndex: number | null = null;
                    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                      nextIndex = (choiceIndex + 1) % question.choices.length;
                    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                      nextIndex = (choiceIndex - 1 + question.choices.length) % question.choices.length;
                    } else if (event.key === "Home") {
                      nextIndex = 0;
                    } else if (event.key === "End") {
                      nextIndex = question.choices.length - 1;
                    }
                    if (nextIndex === null) return;
                    event.preventDefault();
                    void selectChoice(nextIndex);
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                      [nextIndex]?.focus();
                  }}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected || (question.selectedIndex === null && choiceIndex === 0) ? 0 : -1}
                  disabled={
                    Boolean(question.checked) ||
                    savingItemId !== null ||
                    checkingItemId !== null
                  }
                  style={
                    correctChoice
                      ? { borderColor: "#24946b", background: "#eefbf5" }
                      : wrongChoice
                        ? { borderColor: "#d85d4d", background: "#fff3f0" }
                        : question.checked
                          ? { opacity: 0.68 }
                          : undefined
                  }
                >
                  <span>{choiceIndex + 1}</span>
                  <strong><FormulaText text={choice} /></strong>
                  {correctChoice && (
                    <em className="choice-result-label" style={{ marginLeft: "auto", color: "#177451", fontStyle: "normal", fontWeight: 850 }}>
                      정답
                    </em>
                  )}
                  {wrongChoice && (
                    <em className="choice-result-label" style={{ marginLeft: "auto", color: "#a84431", fontStyle: "normal", fontWeight: 850 }}>
                      내 선택
                    </em>
                  )}
                </button>
              );
            })}
          </div>

          {question.checked && (
            <div
              className={`notice ${question.isCorrect ? "notice-success" : "notice-error"} answer-check-feedback`}
              role="status"
              style={{ marginTop: 16 }}
            >
              {question.isCorrect
                ? "정답입니다. 잘 풀었어요."
                : `오답입니다. 정답은 ${
                    question.answerIndex === null || question.answerIndex === undefined
                      ? "확인할 수 없습니다"
                      : `${question.answerIndex + 1}번`
                  }입니다.`}
            </div>
          )}

          <section
            id={`explanation-${question.itemId}`}
            className="explanation-panel"
            aria-label="문제 해설"
            hidden={!question.checked || !explanationOpen}
            style={{ marginTop: 16, padding: 20, border: "1px solid #dce4ef", borderRadius: 14, background: "#f8faff" }}
          >
            <span className="eyebrow">이 문제는 이렇게 풉니다</span>
            <p className="explanation" style={{ marginBottom: 0 }}>
              <ExplanationText text={question.explanation || "등록된 해설이 없습니다."} />
            </p>
          </section>

          <div className="question-actions online-question-actions">
            <button
              className="button button-quiet question-action-nav"
              disabled={currentIndex === 0 || checkingItemId !== null}
              onClick={() => { setCurrentIndex((index) => Math.max(0, index - 1)); setConfirmSubmit(false); }}
              aria-label="이전 문제"
              title="이전 문제"
            >
              ←
            </button>
            <div className="question-action-center">
              {question.checked ? (
                <button
                  className="button button-primary explanation-toggle"
                  onClick={() =>
                    setOpenExplanations((current) => ({
                      ...current,
                      [question.itemId]: !current[question.itemId],
                    }))
                  }
                  aria-expanded={explanationOpen}
                  aria-controls={`explanation-${question.itemId}`}
                >
                  {explanationOpen ? "해설 닫기" : "해설 보기"}
                </button>
              ) : (
                <button
                  className="button button-primary answer-check-button"
                  onClick={checkAnswer}
                  disabled={question.selectedIndex === null || checkingItemId !== null}
                >
                  {checkingItemId === question.itemId ? "확인 중…" : "정답 확인"}
                </button>
              )}
            </div>
            <button
              className="button button-primary question-action-nav"
              disabled={currentIndex === exam.questions.length - 1 || checkingItemId !== null}
              onClick={() => { setCurrentIndex((index) => Math.min(exam.questions.length - 1, index + 1)); setConfirmSubmit(false); }}
              aria-label="다음 문제"
              title="다음 문제"
            >
              →
            </button>
          </div>
        </section>
        <PencilScratchpad storageKey={`question:${question.questionId}`} />
      </div>
    </div>
  );
}

function ExamResult({ result, onRestart }: { result: ResultData; onRestart: () => void }) {
  const wrong = result.results.filter((row) => !row.isCorrect);
  const isOfficialFullExam = result.officialResult.evaluated;
  const passed = isOfficialFullExam && result.officialResult.passed === true;
  const displayScore = isOfficialFullExam ? result.overallAverage : result.score;
  const failedSubjectNames = result.subjectScores
    .filter((subjectScore) => subjectScore.isFailed === true)
    .map((subjectScore) => subjectName(subjectScore.code));
  return (
    <div className="page-stack result-page">
      <section
        className={`result-hero${isOfficialFullExam ? ` result-verdict ${passed ? "is-passed" : "is-failed"}` : ""}`}
      >
        <div className="score-ring">
          <strong>{displayScore}</strong><span>점</span>
        </div>
        <div>
          <span className="eyebrow">{isOfficialFullExam ? "실전 모의고사 채점 완료" : "채점 완료"}</span>
          <h1>
            {isOfficialFullExam
              ? passed
                ? "합격 기준을 통과했어요."
                : "이번 결과는 불합격이에요."
              : `${result.correctCount}문제를 맞혔어요.`}
          </h1>
          {isOfficialFullExam ? (
            <p>
              전체 평균 {result.overallAverage}점 · 합격 기준 평균 {result.officialResult.passingAverage}점 이상
              {failedSubjectNames.length > 0
                ? ` · 과락(${result.officialResult.minimumSubjectScore}점 미만): ${failedSubjectNames.join(", ")}`
                : " · 과락 과목 없음"}
            </p>
          ) : (
            <p>틀린 문제는 공식·이론 카드와 연결해 다시 볼 수 있습니다.</p>
          )}
          <button className="button button-primary" onClick={onRestart}>새 시험 만들기</button>
        </div>
      </section>

      <section className="score-grid">
        {result.subjectScores.map((subjectScore) => {
          const score = Number.isFinite(subjectScore.score)
            ? subjectScore.score
            : subjectScore.total
              ? Math.round((subjectScore.correct / subjectScore.total) * 100)
              : 0;
          const failed = isOfficialFullExam && subjectScore.isFailed === true;
          return (
            <article className={failed ? "is-failed" : ""} key={subjectScore.code}>
              <span>{subjectName(subjectScore.code)}</span>
              <strong>{score}<small>점</small></strong>
              <small>
                {subjectScore.total}문제 중 {subjectScore.correct}개 정답
                {isOfficialFullExam ? ` · 문항당 ${subjectScore.pointsPerQuestion}점` : ""}
                {failed ? " · 과락" : ""}
              </small>
              <div className="progress-track"><span style={{ width: `${score}%` }} /></div>
            </article>
          );
        })}
      </section>

      <section>
        <div className="section-heading">
          <div><span className="eyebrow">오답 복습</span><h2>{wrong.length ? `${wrong.length}문제를 다시 확인하세요` : "전부 맞혔습니다"}</h2></div>
        </div>
        <div className="wrong-list">
          {wrong.map((row) => (
            <article key={row.itemId}>
              <div className="wrong-head">
                <span>{subjectName(row.subjectCode)} · {row.position}번</span>
                <small>{row.sourceDocument} p.{row.sourcePage ?? "–"}</small>
              </div>
              <h3><FormulaText text={row.stem} /></h3>
              <p className="answer-line">
                내 답: <b>{row.selectedIndex === null ? "미선택" : <FormulaText text={row.choices[row.selectedIndex]} />}</b>
                <span>정답: <b><FormulaText text={row.choices[row.answerIndex]} /></b></span>
              </p>
              <p className="explanation"><ExplanationText text={row.explanation} /></p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
