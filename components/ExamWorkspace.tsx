"use client";

import { useEffect, useMemo, useState } from "react";
import { subjectName } from "../lib/subjects";
import type { DashboardSubject, ExamQuestion } from "../lib/types";

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
  questions: ExamQuestion[];
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
  subjectScores: Array<{ code: string; correct: number; total: number }>;
  results: ResultRow[];
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

  useEffect(() => {
    fetch("/api/dashboard")
      .then((response) => response.json())
      .then(setDashboard)
      .catch(() => setError("문제은행 현황을 불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    if (!exam || result) return;
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [exam, result]);

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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "시험을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function selectChoice(choiceIndex: number) {
    if (!exam || result) return;
    const question = exam.questions[currentIndex];
    setExam({
      ...exam,
      questions: exam.questions.map((item, index) =>
        index === currentIndex ? { ...item, selectedIndex: choiceIndex } : item,
      ),
    });
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "답을 저장하지 못했습니다.");
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
            <h1>오늘은 어떤 방식으로 풀까요?</h1>
            <p>같은 유형은 한 번만, 5과목은 같은 비율로 출제됩니다.</p>
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
              <li>제출 전에는 정답 비공개</li>
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

  return (
    <div className="exam-workspace">
      <section className="exam-topbar">
        <div>
          <span className="eyebrow">{exam.session.mode === "priority" ? "중요문제" : "랜덤 모의고사"}</span>
          <strong>{answeredCount}/{exam.questions.length} 답안 선택</strong>
        </div>
        <div className="exam-clock" aria-label={`경과 시간 ${formatTime(elapsed)}`}>
          <span>경과 시간</span><b>{formatTime(elapsed)}</b>
        </div>
        <button className="button button-dark" onClick={submitExam} disabled={busy}>
          답안 제출
        </button>
      </section>

      {error && <div className="notice notice-error">{error}</div>}
      {confirmSubmit && (
        <div className="notice notice-warning">
          <span>아직 {unanswered}문제가 비어 있습니다. 그대로 제출할까요?</span>
          <div>
            <button onClick={() => setConfirmSubmit(false)}>계속 풀기</button>
            <button onClick={submitExam}>제출하기</button>
          </div>
        </div>
      )}

      <div className="exam-layout">
        <aside className="question-map">
          <div className="question-map-head">
            <h2>문항표</h2><span>{exam.questions.length}문제</span>
          </div>
          <div className="question-map-grid">
            {exam.questions.map((item, index) => (
              <button
                className={`${index === currentIndex ? "is-current" : ""}${
                  item.selectedIndex !== null ? " is-answered" : ""
                }`}
                key={item.itemId}
                onClick={() => { setCurrentIndex(index); setConfirmSubmit(false); }}
                aria-label={`${item.position}번${item.selectedIndex !== null ? " 답안 선택됨" : ""}`}
              >
                {item.position}
              </button>
            ))}
          </div>
          <div className="question-map-legend">
            <span><i className="legend-current" /> 현재</span>
            <span><i className="legend-answered" /> 답안 선택</span>
            <span><i /> 미선택</span>
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
          <h1>{question.stem}</h1>

          <div className="choice-list" role="radiogroup" aria-label="선택지">
            {question.choices.map((choice, choiceIndex) => {
              const selected = question.selectedIndex === choiceIndex;
              return (
                <button
                  className={selected ? "is-selected" : ""}
                  key={`${question.itemId}-${choiceIndex}`}
                  onClick={() => selectChoice(choiceIndex)}
                  role="radio"
                  aria-checked={selected}
                >
                  <span>{choiceIndex + 1}</span>
                  <strong>{choice}</strong>
                </button>
              );
            })}
          </div>

          <div className="question-actions">
            <button
              className="button button-quiet"
              disabled={currentIndex === 0}
              onClick={() => { setCurrentIndex((index) => Math.max(0, index - 1)); setConfirmSubmit(false); }}
            >
              ← 이전 문제
            </button>
            <span>{currentIndex + 1} / {exam.questions.length}</span>
            {currentIndex < exam.questions.length - 1 ? (
              <button
                className="button button-primary"
                onClick={() => { setCurrentIndex((index) => index + 1); setConfirmSubmit(false); }}
              >
                다음 문제 →
              </button>
            ) : (
              <button className="button button-dark" onClick={submitExam}>채점하기</button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ExamResult({ result, onRestart }: { result: ResultData; onRestart: () => void }) {
  const wrong = result.results.filter((row) => !row.isCorrect);
  return (
    <div className="page-stack result-page">
      <section className="result-hero">
        <div className="score-ring">
          <strong>{result.score}</strong><span>점</span>
        </div>
        <div>
          <span className="eyebrow">채점 완료</span>
          <h1>{result.correctCount}문제를 맞혔어요.</h1>
          <p>틀린 문제는 공식·이론 카드와 연결해 다시 볼 수 있습니다.</p>
          <button className="button button-primary" onClick={onRestart}>새 시험 만들기</button>
        </div>
      </section>

      <section className="score-grid">
        {result.subjectScores.map((score) => (
          <article key={score.code}>
            <span>{subjectName(score.code)}</span>
            <strong>{score.correct}<small>/{score.total}</small></strong>
            <div className="progress-track"><span style={{ width: `${(score.correct / score.total) * 100}%` }} /></div>
          </article>
        ))}
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
              <h3>{row.stem}</h3>
              <p className="answer-line">
                내 답: <b>{row.selectedIndex === null ? "미선택" : row.choices[row.selectedIndex]}</b>
                <span>정답: <b>{row.choices[row.answerIndex]}</b></span>
              </p>
              <p className="explanation">{row.explanation}</p>
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
