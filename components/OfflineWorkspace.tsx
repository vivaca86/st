"use client";

import { useEffect, useMemo, useState } from "react";
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
import { SUBJECTS, subjectName } from "../lib/subjects";
import type {
  OfflineAttempt,
  OfflineExamSession,
  OfflinePack,
  OfflineQuestion,
} from "../lib/types";

type ResultRow = {
  question: OfflineQuestion;
  selectedIndex: number | null;
  isCorrect: boolean;
};

type LocalResult = {
  correctCount: number;
  totalQuestions: number;
  score: number;
  rows: ResultRow[];
};

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
  const id = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

export function OfflineWorkspace() {
  const [pack, setPack] = useState<OfflinePack | null>(null);
  const [session, setSession] = useState<OfflineExamSession | null>(null);
  const [result, setResult] = useState<LocalResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
          setSession(savedSession);
        } else if (savedSession) {
          setError("진행 중인 시험의 문제팩을 찾지 못했습니다. 기기 저장본은 삭제하지 않았습니다.");
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
  const availablePerSubject = pack
    ? Math.min(
        ...SUBJECTS.map((subject) =>
          uniqueFamilies(pack.questions.filter((question) => question.subjectCode === subject.code)).length,
        ),
      )
    : 0;

  async function downloadPack() {
    if (!online) {
      setError("인터넷에 연결한 뒤 최신 문제팩을 내려받아 주세요.");
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
        throw new Error(detail.error ?? "문제팩을 내려받지 못했습니다.");
      }
      if (!isOfflinePack(payload)) throw new Error("지원하지 않는 문제팩 형식입니다.");
      await installOfflinePack(payload);
      if (!session || session.packVersion === payload.version) setPack(payload);
      setMessage(`문제 ${payload.questions.length}개와 암기 카드 ${payload.studyItems.length}개를 이 기기에 저장했습니다.`);
      const registration = await navigator.serviceWorker?.ready;
      registration?.active?.postMessage({
        type: "CACHE_URLS",
        urls: ["/", "/offline", "/exam", "/formulas", "/review", "/manifest.webmanifest"],
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문제팩을 내려받지 못했습니다.");
    } finally {
      setInstalling(false);
    }
  }

  async function removeDownloadedData() {
    if (!window.confirm("이 기기에 저장한 문제팩, 진행 중 시험, 풀이 기록을 모두 지울까요?")) return;
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
        setError(`${subject.name}의 저장된 문제가 ${perSubject}개보다 적습니다.`);
        return;
      }
      selected.push(...shuffled(candidates).slice(0, perSubject));
    }
    const nextSession: OfflineExamSession = {
      id: makeId("offline-session"),
      packVersion: pack.version,
      createdAt: new Date().toISOString(),
      questionIds: selected.map((question) => question.id),
      answers: {},
      currentIndex: 0,
    };
    setResult(null);
    setSession(nextSession);
    await saveOfflineSession(nextSession);
  }

  function updateSession(nextSession: OfflineExamSession) {
    setSession(nextSession);
    void saveOfflineSession(nextSession).catch((reason: Error) => setError(reason.message));
  }

  function selectChoice(choiceIndex: number) {
    if (!session || !currentQuestion) return;
    updateSession({
      ...session,
      answers: { ...session.answers, [currentQuestion.id]: choiceIndex },
    });
  }

  function goToQuestion(index: number) {
    if (!session) return;
    updateSession({
      ...session,
      currentIndex: Math.max(0, Math.min(examQuestions.length - 1, index)),
    });
  }

  async function submitExam() {
    if (!pack || !session) return;
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
    const nextResult = { correctCount, totalQuestions: rows.length, score, rows };
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
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? `채점 결과를 저장하지 못했습니다. 시험은 그대로 유지됩니다: ${reason.message}`
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
    return <div className="skeleton skeleton-hero" aria-label="오프라인 문제팩 확인 중" />;
  }

  if (result) {
    const wrongRows = result.rows.filter((row) => !row.isCorrect);
    return (
      <div className="page-stack result-page offline-result">
        <section className="result-hero">
          <div className="score-ring"><strong>{result.score}</strong><span>점</span></div>
          <div>
            <span className="eyebrow">기기 안에서 채점 완료</span>
            <h1>{result.correctCount} / {result.totalQuestions} 정답</h1>
            <p>결과는 이 브라우저의 로컬 저장소에만 기록했습니다.</p>
            <button className="button button-primary" onClick={returnToSetup}>다른 시험 만들기</button>
          </div>
        </section>
        <section>
          <div className="section-heading">
            <div><span className="eyebrow">오답 확인</span><h2>{wrongRows.length}문제 다시 보기</h2></div>
          </div>
          <div className="wrong-list">
            {wrongRows.map((row, index) => (
              <article key={row.question.id}>
                <div className="wrong-head">
                  <span>{subjectName(row.question.subjectCode)} · 문제 {index + 1}</span>
                  <small>{row.question.sourceDocument} p.{row.question.sourcePage ?? "-"}</small>
                </div>
                <h3>{row.question.stem}</h3>
                <div className="answer-line">
                  <span>내 답 <b>{row.selectedIndex === null ? "미응답" : row.question.choices[row.selectedIndex]}</b></span>
                  <span>정답 <b>{row.question.choices[row.question.answerIndex]}</b></span>
                </div>
                <p className="explanation">{row.question.explanation}</p>
              </article>
            ))}
            {wrongRows.length === 0 && <div className="notice notice-success">전부 맞혔습니다.</div>}
          </div>
        </section>
      </div>
    );
  }

  if (session && currentQuestion) {
    return (
      <div className="exam-workspace offline-exam">
        <section className="exam-topbar">
          <div><span className="eyebrow">오프라인 로컬 시험</span><strong>{answeredCount}/{examQuestions.length} 답안 선택</strong></div>
          <span className="offline-network-badge is-local">기기 저장본</span>
          <button className="button button-dark" onClick={submitExam}>채점하기</button>
        </section>
        {error && <div className="notice notice-error">{error}</div>}
        <div className="exam-layout">
          <aside className="question-map">
            <div className="question-map-head"><h2>문항표</h2><span>{examQuestions.length}문제</span></div>
            <div className="question-map-grid">
              {examQuestions.map((question, index) => (
                <button
                  className={`${index === session.currentIndex ? "is-current" : ""}${session.answers[question.id] !== undefined ? " is-answered" : ""}`}
                  key={question.id}
                  onClick={() => goToQuestion(index)}
                  aria-label={`${index + 1}번${session.answers[question.id] !== undefined ? " 답안 선택됨" : ""}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <button className="offline-leave" onClick={leaveExam}>시험 나가기</button>
          </aside>
          <section className="question-panel">
            <div className="question-meta">
              <span className="subject-pill">{subjectName(currentQuestion.subjectCode)}</span>
              <span>{currentQuestion.sourceDocument}</span>
              <span>p.{currentQuestion.sourcePage ?? "-"}</span>
            </div>
            <div className="question-number">문제 {session.currentIndex + 1}</div>
            <h1>{currentQuestion.stem}</h1>
            <div className="choice-list" role="radiogroup" aria-label="선택지">
              {currentQuestion.choices.map((choice, choiceIndex) => {
                const selected = session.answers[currentQuestion.id] === choiceIndex;
                return (
                  <button
                    className={selected ? "is-selected" : ""}
                    key={`${currentQuestion.id}-${choiceIndex}`}
                    onClick={() => selectChoice(choiceIndex)}
                    role="radio"
                    aria-checked={selected}
                  >
                    <span>{choiceIndex + 1}</span><strong>{choice}</strong>
                  </button>
                );
              })}
            </div>
            <div className="question-actions">
              <button className="button button-quiet" disabled={session.currentIndex === 0} onClick={() => goToQuestion(session.currentIndex - 1)}>← 이전 문제</button>
              <span>{session.currentIndex + 1} / {examQuestions.length}</span>
              {session.currentIndex < examQuestions.length - 1 ? (
                <button className="button button-primary" onClick={() => goToQuestion(session.currentIndex + 1)}>다음 문제 →</button>
              ) : (
                <button className="button button-dark" onClick={submitExam}>채점하기</button>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack offline-page">
      <section className="page-title-row">
        <div>
          <span className="eyebrow">인터넷 없이 이어서 공부</span>
          <h1>오프라인 문제팩</h1>
          <p>검수된 문제와 공식·이론을 한 번 내려받으면 답안 저장과 채점까지 이 기기에서 처리합니다.</p>
        </div>
        <span className={`offline-network-badge${online ? " is-online" : " is-offline"}`}>
          {online ? "인터넷 연결됨" : "현재 오프라인"}
        </span>
      </section>

      {error && <div className="notice notice-error">{error}</div>}
      {message && <div className="notice notice-success">{message}</div>}

      <section className="offline-pack-card">
        <div className="offline-pack-copy">
          <span className="card-kicker">{pack ? `설치됨 · ${pack.version}` : "아직 설치되지 않음"}</span>
          <h2>{pack ? pack.title : "먼저 문제팩을 이 기기에 저장하세요"}</h2>
          <p>
            문제팩에는 자기학습 채점을 위한 정답과 해설이 함께 들어 있습니다.
            브라우저 개발자 도구로는 내용을 볼 수 있으므로 시험 보안용이 아닌 개인 학습용입니다.
          </p>
          <div className="offline-pack-actions">
            <button className="button button-primary button-large" onClick={downloadPack} disabled={installing || !online}>
              {installing ? "문제팩 저장 중…" : pack ? "최신 문제팩 다시 받기" : "오프라인 문제팩 받기"}
            </button>
            <a className="button button-quiet" href="/api/offline-pack?download=1">JSON 파일로 보관</a>
            {pack && <button className="button button-danger-quiet" onClick={removeDownloadedData}>기기 저장본 삭제</button>}
          </div>
        </div>
        <div className="offline-pack-stats" aria-label="설치된 문제팩 정보">
          <div><strong>{pack?.questions.length ?? 0}</strong><span>검증 문제</span></div>
          <div><strong>{pack?.studyItems.length ?? 0}</strong><span>암기 카드</span></div>
          <div><strong>{pack?.assetManifest.assets.length ?? 0}</strong><span>이미지 자산</span></div>
        </div>
      </section>

      {pack ? (
        <>
          <section>
            <div className="section-heading">
              <div><span className="eyebrow">로컬 랜덤 출제</span><h2>저장된 문제로 바로 풀기</h2></div>
              <p>답안은 문제를 누를 때마다 자동 저장됩니다.</p>
            </div>
            <div className="offline-mode-grid">
              <article>
                <span className="mode-number">10</span><h3>미니 모의고사</h3><p>과목별 2문제, 총 10문제를 기기 안에서 랜덤 출제합니다.</p>
                <button className="button button-primary" disabled={availablePerSubject < 2} onClick={() => startExam(2)}>10문제 시작</button>
              </article>
              <article>
                <span className="mode-number">{availablePerSubject * 5}</span><h3>현재 문제팩 전체형</h3><p>중복 유형을 제외하고 과목별 {availablePerSubject}문제씩 출제합니다.</p>
                <button className="button button-secondary" disabled={availablePerSubject < 1} onClick={() => startExam(availablePerSubject)}>전체형 시작</button>
              </article>
              <article className="is-locked">
                <span className="mode-number">100</span><h3>정규 100문제</h3><p>각 과목의 검증 문제가 20개 이상 저장되면 오프라인에서도 열립니다.</p>
                <button className="button button-quiet" disabled={availablePerSubject < 20} onClick={() => startExam(20)}>{availablePerSubject >= 20 ? "100문제 시작" : "문제 DB 확장 중"}</button>
              </article>
            </div>
          </section>

          <section>
            <div className="section-heading">
              <div><span className="eyebrow">문제팩에 함께 저장됨</span><h2>공식·이론 암기 카드</h2></div>
              <p>{pack.studyItems.length}개 · 출제 연결 빈도순</p>
            </div>
            <div className="offline-study-list">
              {pack.studyItems.slice(0, 8).map((item) => (
                <details key={item.id}>
                  <summary><span>{item.kind === "formula" ? "공식" : "이론"}</span><strong>{item.prompt}</strong><small>{item.frequency}회</small></summary>
                  <div><b>{item.content}</b>{item.caution && <p>주의: {item.caution}</p>}</div>
                </details>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="empty-state">
          <span>↓</span><h2>저장된 문제팩이 없습니다</h2><p>인터넷에 연결된 상태에서 위 버튼을 한 번 누르면 이후에는 오프라인으로 풀 수 있습니다.</p>
        </section>
      )}
    </div>
  );
}
