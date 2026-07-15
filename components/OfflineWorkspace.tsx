"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearOfflineSession,
  completeOfflineExam,
  deleteOfflineData,
  getInstalledOfflinePack,
  getOfflinePackByVersion,
  getOfflineSession,
  installOfflinePack,
  saveOfflineSession,
} from "../lib/offline-db";
import { SUBJECTS } from "../lib/subjects";
import type {
  OfflineAttempt,
  OfflineExamSession,
  OfflinePack,
  OfflineQuestion,
} from "../lib/types";
import { ExplanationText, FormulaText } from "./FormulaText";
import { PencilScratchpad } from "./PencilScratchpad";

type LocalSession = OfflineExamSession & {
  checkedQuestionIds?: string[];
  explanationQuestionIds?: string[];
};

type ResultRow = {
  question: OfflineQuestion;
  selectedIndex: number | null;
  isCorrect: boolean;
};

type SubjectResult = {
  code: string;
  name: string;
  correctCount: number;
  totalQuestions: number;
  score: number;
  failed: boolean;
};

type LocalResult = {
  correctCount: number;
  totalQuestions: number;
  score: number;
  rows: ResultRow[];
  subjectResults: SubjectResult[];
  official: boolean;
  averageScore: number;
  passed: boolean | null;
};

const SUBJECT_NAMES: Record<string, string> = {
  electromagnetics: "전기자기학",
  "electric-machines": "전기기기",
  "power-engineering": "전력공학",
  "circuit-theory": "회로이론",
  "electrical-regulations": "전기설비기술기준",
};

const SUBJECT_SHORT_NAMES: Record<string, string> = {
  electromagnetics: "자기학",
  "electric-machines": "기기",
  "power-engineering": "전력",
  "circuit-theory": "회로",
  "electrical-regulations": "설비",
};

function displaySubjectName(code: string) {
  return SUBJECT_NAMES[code] ?? code;
}

function isOfflinePack(value: unknown): value is OfflinePack {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OfflinePack>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.version === "string" &&
    Array.isArray(candidate.questions) &&
    Array.isArray(candidate.studyItems) &&
    Array.isArray(candidate.subjects) &&
    candidate.assetManifest?.version === 1 &&
    Array.isArray(candidate.assetManifest.assets)
  );
}

function randomUnit() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  }
  return Math.random();
}

function shuffled<T>(values: T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(randomUnit() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function uniqueFamilies(questions: OfflineQuestion[]) {
  const families = new Map<string, OfflineQuestion>();
  for (const question of questions) {
    const current = families.get(question.duplicateGroupId);
    if (!current || question.importanceScore > current.importanceScore) {
      families.set(question.duplicateGroupId, question);
    }
  }
  return [...families.values()];
}

function makeId(prefix: string) {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function includesId(values: string[] | undefined, id: string) {
  return values?.includes(id) ?? false;
}

export function OfflineWorkspace() {
  const [pack, setPack] = useState<OfflinePack | null>(null);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [result, setResult] = useState<LocalResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const sessionWritePending = useRef(false);
  const currentQuestionButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let active = true;
    const updateConnection = () => setOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    Promise.all([getInstalledOfflinePack(), getOfflineSession()])
      .then(async ([installedPack, savedSession]) => {
        const sessionPack = savedSession
          ? savedSession.packVersion === installedPack?.version
            ? installedPack
            : await getOfflinePackByVersion(savedSession.packVersion)
          : null;
        if (!active) return;
        setPack(sessionPack ?? installedPack);
        if (sessionPack && savedSession) {
          setSession(savedSession as LocalSession);
        } else if (savedSession) {
          setError("진행 중인 시험에 필요한 문제 DB를 찾지 못했습니다. 기기 저장본은 삭제하지 않았습니다.");
        }
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  useEffect(() => {
    const button = currentQuestionButtonRef.current;
    const scroller = button?.parentElement;
    if (!button || !scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    scroller.scrollTo({
      left: button.offsetLeft - scroller.clientWidth / 2 + button.clientWidth / 2,
      behavior: "smooth",
    });
  }, [session?.currentIndex]);

  const examQuestions = useMemo(() => {
    if (!pack || !session) return [];
    const byId = new Map(pack.questions.map((question) => [question.id, question]));
    return session.questionIds.flatMap((id) => {
      const question = byId.get(id);
      return question ? [question] : [];
    });
  }, [pack, session]);

  const currentQuestion = session ? examQuestions[session.currentIndex] : null;
  const answeredCount = session ? Object.keys(session.answers).length : 0;
  const unansweredCount = session ? Math.max(0, examQuestions.length - answeredCount) : 0;
  const availablePerSubject = pack
    ? Math.min(
        ...SUBJECTS.map(
          (subject) =>
            uniqueFamilies(
              pack.questions.filter((question) => question.subjectCode === subject.code),
            ).length,
        ),
      )
    : 0;

  async function downloadPack() {
    if (!online) {
      setError("최신 문제 DB를 내려받으려면 먼저 인터넷에 연결해 주세요.");
      return;
    }
    setInstalling(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/offline-pack", { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const detail = payload as { error?: string };
        throw new Error(detail.error ?? "문제 DB를 내려받지 못했습니다.");
      }
      if (!isOfflinePack(payload)) throw new Error("지원하지 않는 문제 DB 형식입니다.");
      await installOfflinePack(payload);
      await navigator.storage?.persist?.().catch(() => false);
      if (!session || session.packVersion === payload.version) setPack(payload);
      setMessage(
        `문제 ${payload.questions.length}개와 암기 카드 ${payload.studyItems.length}개를 이 기기의 문제 DB에 저장했습니다.`,
      );
      const registration = await navigator.serviceWorker?.ready;
      registration?.active?.postMessage({
        type: "CACHE_URLS",
        urls: ["/", "/offline", "/exam", "/formulas", "/review", "/manifest.webmanifest"],
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문제 DB를 내려받지 못했습니다.");
    } finally {
      setInstalling(false);
    }
  }

  async function removeDownloadedData() {
    if (!window.confirm("이 기기에 저장한 문제 DB, 진행 중인 시험, 풀이 기록을 모두 지울까요?")) return;
    try {
      await deleteOfflineData();
      setPack(null);
      setSession(null);
      setResult(null);
      setMessage("이 기기에 저장한 오프라인 학습 데이터를 삭제했습니다.");
      setError("");
      const registration = await navigator.serviceWorker?.ready;
      registration?.active?.postMessage({ type: "CLEAR_OFFLINE_PACK_CACHE" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "오프라인 데이터를 삭제하지 못했습니다.");
    }
  }

  async function startExam(perSubject: number) {
    if (!pack) return;
    setError("");
    const selected: OfflineQuestion[] = [];
    for (const subject of SUBJECTS) {
      const candidates = uniqueFamilies(
        pack.questions.filter((question) => question.subjectCode === subject.code),
      );
      if (candidates.length < perSubject) {
        setError(`${displaySubjectName(subject.code)}에 저장된 문제가 ${perSubject}개보다 적습니다.`);
        return;
      }
      selected.push(...shuffled(candidates).slice(0, perSubject));
    }
    const nextSession: LocalSession = {
      id: makeId("offline-session"),
      packVersion: pack.version,
      createdAt: new Date().toISOString(),
      questionIds: selected.map((question) => question.id),
      answers: {},
      currentIndex: 0,
      checkedQuestionIds: [],
      explanationQuestionIds: [],
    };
    setResult(null);
    await updateSession(nextSession);
  }

  async function updateSession(nextSession: LocalSession) {
    if (sessionWritePending.current) return false;
    sessionWritePending.current = true;
    setSavingSession(true);
    try {
      await saveOfflineSession(nextSession);
      setSession(nextSession);
      setConfirmSubmit(false);
      setError("");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "진행 상태를 기기에 저장하지 못했습니다.");
      return false;
    } finally {
      sessionWritePending.current = false;
      setSavingSession(false);
    }
  }

  function selectChoice(choiceIndex: number) {
    if (!session || !currentQuestion) return;
    if (includesId(session.checkedQuestionIds, currentQuestion.id)) return;
    void updateSession({
      ...session,
      answers: { ...session.answers, [currentQuestion.id]: choiceIndex },
    });
  }

  function checkAnswer() {
    if (!session || !currentQuestion) return;
    if (savingSession) return;
    if (session.answers[currentQuestion.id] === undefined) return;
    if (includesId(session.checkedQuestionIds, currentQuestion.id)) return;
    void updateSession({
      ...session,
      checkedQuestionIds: [...(session.checkedQuestionIds ?? []), currentQuestion.id],
    });
  }

  function toggleExplanation() {
    if (!session || !currentQuestion) return;
    if (!includesId(session.checkedQuestionIds, currentQuestion.id)) return;
    const openIds = session.explanationQuestionIds ?? [];
    void updateSession({
      ...session,
      explanationQuestionIds: includesId(openIds, currentQuestion.id)
        ? openIds.filter((id) => id !== currentQuestion.id)
        : [...openIds, currentQuestion.id],
    });
  }

  function goToQuestion(index: number) {
    if (!session) return;
    void updateSession({
      ...session,
      currentIndex: Math.max(0, Math.min(examQuestions.length - 1, index)),
    });
  }

  async function submitExam() {
    if (!pack || !session || examQuestions.length === 0 || savingSession) return;
    const unanswered = examQuestions.length - answeredCount;
    if (unanswered > 0 && !confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    const rows = examQuestions.map((question) => {
      const selectedIndex = session.answers[question.id] ?? null;
      return {
        question,
        selectedIndex,
        isCorrect: selectedIndex === question.answerIndex,
      };
    });
    const correctCount = rows.filter((row) => row.isCorrect).length;
    const score = Math.round((correctCount / rows.length) * 100);
    const subjectTotals = SUBJECTS.map((subject) => {
      const subjectRows = rows.filter((row) => row.question.subjectCode === subject.code);
      const subjectCorrect = subjectRows.filter((row) => row.isCorrect).length;
      const subjectScore = subjectRows.length
        ? Math.round((subjectCorrect / subjectRows.length) * 100)
        : 0;
      return {
        code: subject.code,
        name: displaySubjectName(subject.code),
        correctCount: subjectCorrect,
        totalQuestions: subjectRows.length,
        score: subjectScore,
        failed: false,
      };
    });
    const official =
      rows.length === 100 &&
      subjectTotals.length === 5 &&
      subjectTotals.every((subject) => subject.totalQuestions === 20);
    const subjectResults = subjectTotals.map((subject) => ({
      ...subject,
      failed: official && subject.score < 40,
    }));
    const averageScore = Math.round(
      subjectResults.reduce((sum, subject) => sum + subject.score, 0) / subjectResults.length,
    );
    const passed = official
      ? averageScore >= 60 && subjectResults.every((subject) => !subject.failed)
      : null;
    const nextResult: LocalResult = {
      correctCount,
      totalQuestions: rows.length,
      score,
      rows,
      subjectResults,
      official,
      averageScore,
      passed,
    };
    const attempt: OfflineAttempt = {
      id: makeId("offline-attempt"),
      packVersion: pack.version,
      completedAt: new Date().toISOString(),
      questionIds: session.questionIds,
      answers: session.answers,
      correctCount,
      totalQuestions: rows.length,
      score,
    };
    try {
      await completeOfflineExam(attempt);
      setResult(nextResult);
      setSession(null);
      setConfirmSubmit(false);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? `채점 결과를 저장하지 못했습니다. 시험은 그대로 유지됩니다. ${reason.message}`
          : "채점 결과를 저장하지 못했습니다. 시험은 그대로 유지됩니다.",
      );
    }
  }

  async function leaveExam() {
    await clearOfflineSession();
    const latestPack = await getInstalledOfflinePack();
    setPack(latestPack ?? pack);
    setSession(null);
    setResult(null);
  }

  async function returnToSetup() {
    const latestPack = await getInstalledOfflinePack();
    setPack(latestPack ?? pack);
    setResult(null);
  }

  if (loading) {
    return <div className="skeleton skeleton-hero" aria-label="기기 내 문제 DB 확인 중" />;
  }

  if (result) {
    const wrongRows = result.rows.filter((row) => !row.isCorrect);
    return (
      <div className="page-stack result-page offline-result">
        <section className="result-hero">
          <div className="score-ring">
            <strong>{result.official ? result.averageScore : result.score}</strong>
            <span>점</span>
          </div>
          <div>
            <span className="eyebrow">기기 안에서 채점 완료</span>
            <h1>{result.correctCount} / {result.totalQuestions} 정답</h1>
            {result.official ? (
              <div className={`official-verdict ${result.passed ? "is-pass" : "is-fail"}`}>
                <strong>{result.passed ? "합격" : "불합격"}</strong>
                <span>
                  평균 {result.averageScore}점 · 과목별 40점 미만 과락 · 평균 60점 이상 합격
                </span>
              </div>
            ) : (
              <p>미니 시험은 연습용이므로 공식 합격·불합격 판정을 하지 않습니다.</p>
            )}
            <button className="button button-primary" onClick={returnToSetup}>
              새 무작위 시험 만들기
            </button>
          </div>
        </section>

        <section>
          <div className="section-heading">
            <div>
              <span className="eyebrow">과목별 100점 환산</span>
              <h2>과목별 점수</h2>
            </div>
            <p>{result.official ? "20문제 × 문제당 5점" : "과목별 정답률을 100점으로 환산"}</p>
          </div>
          <div className="score-grid">
            {result.subjectResults.map((subject) => (
              <article key={subject.code} className={subject.failed ? "is-failed" : ""}>
                <span>{subject.name}</span>
                <strong>{subject.score}점</strong>
                <small>
                  {subject.correctCount}/{subject.totalQuestions} 정답
                  {subject.failed ? " · 과락" : ""}
                </small>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="section-heading">
            <div>
              <span className="eyebrow">오답 확인</span>
              <h2>{wrongRows.length}문제 다시 보기</h2>
            </div>
          </div>
          <div className="wrong-list">
            {wrongRows.map((row, index) => (
              <article key={row.question.id}>
                <div className="wrong-head">
                  <span>{displaySubjectName(row.question.subjectCode)} · 오답 {index + 1}</span>
                  <small>
                    {row.question.sourceDocument} p.{row.question.sourcePage ?? "-"}
                  </small>
                </div>
                <h3><FormulaText text={row.question.stem} /></h3>
                <div className="answer-line">
                  <span>
                    선택 <b>{row.selectedIndex === null ? "미응답" : <FormulaText text={row.question.choices[row.selectedIndex]} />}</b>
                  </span>
                  <span>
                    정답 <b><FormulaText text={row.question.choices[row.question.answerIndex]} /></b>
                  </span>
                </div>
                <p className="explanation"><ExplanationText text={row.question.explanation} /></p>
              </article>
            ))}
            {wrongRows.length === 0 && <div className="notice notice-success">모두 맞혔습니다.</div>}
          </div>
        </section>
      </div>
    );
  }

  if (session && currentQuestion) {
    const selectedIndex = session.answers[currentQuestion.id];
    const checked = includesId(session.checkedQuestionIds, currentQuestion.id);
    const explanationOpen = includesId(session.explanationQuestionIds, currentQuestion.id);
    const selectedCorrect = selectedIndex === currentQuestion.answerIndex;
    const subjectNavigation = SUBJECTS.flatMap((subject) => {
      const subjectQuestions = examQuestions
        .map((question, index) => ({ question, index }))
        .filter(({ question }) => question.subjectCode === subject.code);
      if (subjectQuestions.length === 0) return [];
      const firstUnanswered = subjectQuestions.find(
        ({ question }) => session.answers[question.id] === undefined,
      );
      return [{
        code: subject.code,
        index: firstUnanswered?.index ?? subjectQuestions[0].index,
        answered: subjectQuestions.filter(
          ({ question }) => session.answers[question.id] !== undefined,
        ).length,
        total: subjectQuestions.length,
      }];
    });
    const currentSubjectQuestions = examQuestions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => question.subjectCode === currentQuestion.subjectCode);

    return (
      <div className="exam-workspace online-exam offline-exam">
        <section className="exam-topbar online-exam-topbar offline-exam-topbar">
          <div className="exam-progress-summary">
            <span className="eyebrow">기기 내 문제 DB · 무작위 출제</span>
            <strong>답 {answeredCount}개 선택</strong>
          </div>
          <button
            className="button button-dark exam-submit-button"
            onClick={submitExam}
            disabled={savingSession}
          >
            <span className="exam-submit-label-full">채점하기</span>
            <span className="exam-submit-label-mobile">채점</span>
          </button>
        </section>
        {error && <div className="notice notice-error">{error}</div>}
        {confirmSubmit && (
          <div className="notice notice-warning">
            <span>아직 {unansweredCount}문제가 비어 있습니다. 미응답은 오답으로 채점됩니다.</span>
            <div>
              <button onClick={() => setConfirmSubmit(false)}>계속 풀기</button>
              <button onClick={submitExam} disabled={savingSession}>그대로 채점</button>
            </div>
          </div>
        )}
        <div className="exam-layout has-pencil-scratchpad">
          <aside className="question-map online-question-map offline-question-map">
            <div className="question-map-head">
              <h2>과목·문항</h2>
              <span>{currentSubjectQuestions.length}문제</span>
            </div>
            <div className="question-subject-tabs" aria-label="과목 바로가기">
              {subjectNavigation.map((subject) => (
                <button
                  className={subject.code === currentQuestion.subjectCode ? "is-current" : ""}
                  key={subject.code}
                  disabled={savingSession}
                  onClick={() => goToQuestion(subject.index)}
                  aria-label={`${displaySubjectName(subject.code)} ${subject.answered}/${subject.total} 답안 선택`}
                  aria-current={subject.code === currentQuestion.subjectCode ? "true" : undefined}
                >
                  <strong>{SUBJECT_SHORT_NAMES[subject.code] ?? displaySubjectName(subject.code)}</strong>
                  <small>{subject.answered}/{subject.total}</small>
                </button>
              ))}
            </div>
            <div className="question-map-grid">
              {currentSubjectQuestions.map(({ question, index }) => {
                const answered = session.answers[question.id] !== undefined;
                const answerChecked = includesId(session.checkedQuestionIds, question.id);
                return (
                  <button
                    className={`${index === session.currentIndex ? "is-current" : ""}${answered ? " is-answered" : ""}${answerChecked ? " is-checked" : ""}`}
                    key={question.id}
                    ref={index === session.currentIndex ? currentQuestionButtonRef : undefined}
                    onClick={() => goToQuestion(index)}
                    disabled={savingSession}
                    aria-label={`${index + 1}번${answered ? " 답 선택됨" : ""}${answerChecked ? " 정답 확인됨" : ""}`}
                    aria-current={index === session.currentIndex ? "step" : undefined}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <button className="offline-leave" onClick={leaveExam} disabled={savingSession}>시험 나가기</button>
          </aside>

          <section className="question-panel">
            <div className="question-meta">
              <span className="subject-pill">{displaySubjectName(currentQuestion.subjectCode)}</span>
              <span>{currentQuestion.sourceDocument}</span>
              <span>p.{currentQuestion.sourcePage ?? "-"}</span>
            </div>
            <div className="question-number">문제 {session.currentIndex + 1}</div>
            <h1><FormulaText text={currentQuestion.stem} /></h1>
            <div className="choice-list" role="radiogroup" aria-label="선택지">
              {currentQuestion.choices.map((choice, choiceIndex) => {
                const selected = selectedIndex === choiceIndex;
                const correctChoice = checked && choiceIndex === currentQuestion.answerIndex;
                const wrongChoice = checked && selected && !correctChoice;
                return (
                  <button
                    className={`${selected ? "is-selected" : ""}${correctChoice ? " is-correct" : ""}${wrongChoice ? " is-wrong" : ""}${checked ? " is-locked" : ""}`}
                    key={`${currentQuestion.id}-${choiceIndex}`}
                    onClick={() => selectChoice(choiceIndex)}
                    onKeyDown={(event) => {
                      if (checked || savingSession) return;
                      let nextIndex: number | null = null;
                      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                        nextIndex = (choiceIndex + 1) % currentQuestion.choices.length;
                      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                        nextIndex =
                          (choiceIndex - 1 + currentQuestion.choices.length) %
                          currentQuestion.choices.length;
                      } else if (event.key === "Home") {
                        nextIndex = 0;
                      } else if (event.key === "End") {
                        nextIndex = currentQuestion.choices.length - 1;
                      }
                      if (nextIndex === null) return;
                      event.preventDefault();
                      selectChoice(nextIndex);
                      event.currentTarget.parentElement
                        ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                        [nextIndex]?.focus();
                    }}
                    role="radio"
                    aria-checked={selected}
                    aria-disabled={checked || savingSession}
                    tabIndex={selected || (selectedIndex === undefined && choiceIndex === 0) ? 0 : -1}
                    disabled={checked || savingSession}
                  >
                    <span>{choiceIndex + 1}</span>
                    <strong><FormulaText text={choice} /></strong>
                  </button>
                );
              })}
            </div>

            {checked && (
              <div className={`answer-feedback ${selectedCorrect ? "is-correct" : "is-wrong"}`} role="status">
                <strong>{selectedCorrect ? "정답입니다." : "오답입니다."}</strong>
                {!selectedCorrect && (
                  <span> 정답은 {currentQuestion.answerIndex + 1}번입니다.</span>
                )}
              </div>
            )}

            <div
              className="explanation-panel"
              id={`offline-explanation-${currentQuestion.id}`}
              hidden={!explanationOpen}
            >
              <span>풀이 해설</span>
              <p><ExplanationText text={currentQuestion.explanation || "등록된 해설이 없습니다."} /></p>
            </div>

            <div className="question-actions online-question-actions offline-question-actions">
              <button
                className="button button-quiet question-action-nav question-arrow"
                disabled={session.currentIndex === 0 || savingSession}
                onClick={() => goToQuestion(session.currentIndex - 1)}
                aria-label="이전 문제"
                title="이전 문제"
              >
                ←
              </button>
              <div className="question-action-center">
                {checked ? (
                  <button
                    className="button button-primary explanation-toggle explanation-button"
                    disabled={savingSession}
                    onClick={toggleExplanation}
                    aria-expanded={explanationOpen}
                    aria-controls={`offline-explanation-${currentQuestion.id}`}
                  >
                    {explanationOpen ? "해설 닫기" : "해설 보기"}
                  </button>
                ) : (
                  <button
                    className="button button-primary answer-check-button"
                    disabled={selectedIndex === undefined || savingSession}
                    onClick={checkAnswer}
                  >
                    {savingSession ? "확인 중…" : "정답 확인"}
                  </button>
                )}
              </div>
              <button
                className="button button-quiet question-action-nav question-arrow"
                disabled={session.currentIndex === examQuestions.length - 1 || savingSession}
                onClick={() => goToQuestion(session.currentIndex + 1)}
                aria-label="다음 문제"
                title="다음 문제"
              >
                →
              </button>
            </div>
          </section>
          <PencilScratchpad storageKey={`question:${currentQuestion.id}`} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack offline-page">
      <section className="page-title-row">
        <div>
          <span className="eyebrow">문제 DB를 기기에 저장해 오프라인으로 풀이</span>
          <h1>오프라인 문제 DB</h1>
          <p>
            인터넷이 될 때 문제 DB를 한 번 내려받습니다. 이후 시험을 만들면 서버에 묻지 않고,
            이 기기에 저장된 DB에서 중복 유형을 제거한 문제를 매번 새로 섞어 무작위로 뽑습니다.
          </p>
        </div>
        <span className={`offline-network-badge${online ? " is-online" : " is-offline"}`}>
          {online ? "인터넷 연결됨" : "현재 오프라인"}
        </span>
      </section>

      {error && <div className="notice notice-error">{error}</div>}
      {message && <div className="notice notice-success">{message}</div>}

      <section className="offline-pack-card">
        <div className="offline-pack-copy">
          <span className="card-kicker">{pack ? `설치됨 · ${pack.version}` : "아직 설치하지 않음"}</span>
          <h2>{pack ? pack.title : "먼저 문제 DB를 이 기기에 저장하세요"}</h2>
          <p>
            내려받은 문제, 정답, 해설, 공식·이론 카드는 브라우저의 기기 내 전용 DB에 저장됩니다.
            시험 출제, 이어풀기, 정답 확인, 채점은 오프라인에서도 모두 이 DB만 사용합니다.
            이 저장본은 개인 학습용입니다.
          </p>
          <div className="offline-pack-actions">
            <button
              className="button button-primary button-large"
              onClick={downloadPack}
              disabled={installing || !online}
            >
              {installing ? "문제 DB 저장 중…" : pack ? "최신 문제 DB 다시 받기" : "문제 DB 기기에 받기"}
            </button>
            {online ? (
              <a className="button button-quiet" href="/api/offline-pack?download=1">JSON으로 별도 보관</a>
            ) : (
              <button className="button button-quiet" disabled title="인터넷 연결이 필요합니다">
                JSON으로 별도 보관
              </button>
            )}
            {pack && (
              <button className="button button-danger-quiet" onClick={removeDownloadedData}>
                기기 저장본 삭제
              </button>
            )}
          </div>
        </div>
        <div className="offline-pack-stats" aria-label="설치된 문제 DB 정보">
          <div><strong>{pack?.questions.length ?? 0}</strong><span>검증 문제</span></div>
          <div><strong>{pack?.studyItems.length ?? 0}</strong><span>암기 카드</span></div>
          <div><strong>{pack?.assetManifest.assets.length ?? 0}</strong><span>이미지 자산</span></div>
        </div>
      </section>

      {pack ? (
        <>
          <section>
            <div className="section-heading">
              <div>
                <span className="eyebrow">기기 내 DB에서 무작위·무복원 출제</span>
                <h2>저장된 문제로 바로 풀기</h2>
              </div>
              <p>같은 문제 유형은 한 번만 넣고, 새 시험을 만들 때마다 다시 섞습니다.</p>
            </div>
            <div className="offline-mode-grid">
              <article>
                <span className="mode-number">10</span>
                <h3>미니 모의고사</h3>
                <p>과목별 2문제, 총 10문제를 기기 내 DB에서 무작위로 출제합니다.</p>
                <button className="button button-primary" disabled={availablePerSubject < 2 || savingSession} onClick={() => startExam(2)}>
                  10문제 시작
                </button>
              </article>
              <article>
                <span className="mode-number">{availablePerSubject * 5}</span>
                <h3>현재 문제 DB 전체형</h3>
                <p>중복 유형을 제외하고 과목별 {availablePerSubject}문제를 무작위로 출제합니다.</p>
                <button className="button button-secondary" disabled={availablePerSubject < 1 || savingSession} onClick={() => startExam(availablePerSubject)}>
                  전체형 시작
                </button>
              </article>
              <article className={availablePerSubject < 20 ? "is-locked" : ""}>
                <span className="mode-number">100</span>
                <h3>정규 100문제</h3>
                <p>5과목 × 20문제. 과목별 100점, 40점 미만 과락, 평균 60점 이상이면 합격입니다.</p>
                <button className="button button-quiet" disabled={availablePerSubject < 20 || savingSession} onClick={() => startExam(20)}>
                  {availablePerSubject >= 20 ? "100문제 시작" : "문제 DB 확장 중"}
                </button>
              </article>
            </div>
          </section>

          <section>
            <div className="section-heading">
              <div>
                <span className="eyebrow">문제 DB에 함께 저장됨</span>
                <h2>공식·이론 암기 카드</h2>
              </div>
              <p>{pack.studyItems.length}개 · 출제 연결 빈도순</p>
            </div>
            <div className="offline-study-list">
              {pack.studyItems.slice(0, 8).map((item) => (
                <details key={item.id}>
                  <summary>
                    <span>{item.kind === "formula" ? "공식" : "이론"}</span>
                    <strong><FormulaText text={item.prompt} /></strong>
                    <small>{item.frequency}회</small>
                  </summary>
                  <div>
                    <b><FormulaText text={item.content} /></b>
                    {item.caution && <p>주의: <FormulaText text={item.caution} /></p>}
                  </div>
                </details>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="empty-state">
          <span>DB</span>
          <h2>기기에 저장된 문제 DB가 없습니다</h2>
          <p>인터넷 연결 상태에서 위 버튼을 한 번 누르면, 이후에는 오프라인으로 문제를 풀 수 있습니다.</p>
        </section>
      )}
    </div>
  );
}
