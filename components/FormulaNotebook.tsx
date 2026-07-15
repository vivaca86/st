"use client";

import { useEffect, useMemo, useState } from "react";
import { SUBJECTS, subjectName } from "../lib/subjects";
import type { StudyItemDto } from "../lib/types";

export function FormulaNotebook() {
  const [items, setItems] = useState<StudyItemDto[]>([]);
  const [kind, setKind] = useState<"all" | "formula" | "theory">("all");
  const [subject, setSubject] = useState("all");
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/study-items")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "암기노트를 불러오지 못했습니다.");
        return payload.items as StudyItemDto[];
      })
      .then(setItems)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          (kind === "all" || item.kind === kind) &&
          (subject === "all" || item.subjectCode === subject),
      ),
    [items, kind, subject],
  );
  const maxFrequency = Math.max(1, ...items.map((item) => item.frequency));

  function toggleCard(id: string) {
    setFlipped((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="page-stack formula-page">
      <section className="page-title-row formula-title-row">
        <div>
          <span className="eyebrow">영단어장처럼 넘기는</span>
          <h1>공식·이론 암기노트</h1>
          <p>같은 공식은 하나로 합치고, 서로 다른 문제 가족에 나온 횟수로 비중을 계산합니다.</p>
        </div>
        <div className="formula-summary">
          <strong>{items.length}</strong><span>중복 제거 카드</span>
          <i />
          <strong>{items.reduce((sum, item) => sum + item.frequency, 0)}</strong><span>연결 문제</span>
        </div>
      </section>

      <section className="notebook-toolbar">
        <div className="segmented" aria-label="암기 종류">
          {(["all", "formula", "theory"] as const).map((value) => (
            <button
              className={kind === value ? "is-active" : ""}
              key={value}
              onClick={() => setKind(value)}
            >
              {value === "all" ? "전체" : value === "formula" ? "공식" : "이론"}
            </button>
          ))}
        </div>
        <select
          aria-label="과목 선택"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        >
          <option value="all">5과목 전체</option>
          {SUBJECTS.map((item) => (
            <option key={item.code} value={item.code}>{item.name}</option>
          ))}
        </select>
        <span className="toolbar-count">{visibleItems.length}개 카드</span>
      </section>

      {loading && <div className="skeleton skeleton-hero" />}
      {error && <div className="notice notice-error">{error}</div>}
      {!loading && !error && visibleItems.length === 0 && (
        <section className="empty-state compact">
          <span>ƒ</span><h2>이 조건의 카드가 아직 없습니다</h2><p>검수된 문제가 늘어나면 자동으로 연결됩니다.</p>
        </section>
      )}

      <section className="formula-grid">
        {visibleItems.map((item) => {
          const isFlipped = flipped.has(item.id);
          const weight = Math.round((item.frequency / maxFrequency) * 100);
          return (
            <button
              className={`flash-card${isFlipped ? " is-flipped" : ""}`}
              key={item.id}
              onClick={() => toggleCard(item.id)}
              aria-label={`${item.title} 카드 ${isFlipped ? "앞면 보기" : "정답 보기"}`}
            >
              <div className="flash-card-inner">
                <div className="flash-face flash-front">
                  <div className="flash-meta">
                    <span className={`kind-chip kind-${item.kind}`}>
                      {item.kind === "formula" ? "공식" : "이론"}
                    </span>
                    <span>{item.subjectCode ? subjectName(item.subjectCode) : "공통"}</span>
                  </div>
                  <span className="flash-label">QUESTION</span>
                  <h2>{item.prompt}</h2>
                  <div className="frequency-block">
                    <span>출제 연결 {item.frequency}회</span>
                    <div><i style={{ width: `${weight}%` }} /></div>
                  </div>
                  <small>눌러서 정답 보기</small>
                </div>

                <div className="flash-face flash-back">
                  <div className="flash-meta">
                    <span className={`kind-chip kind-${item.kind}`}>ANSWER</span>
                    <span>{item.title}</span>
                  </div>
                  <strong className={`formula-content${item.kind === "theory" ? " is-theory" : ""}`}>
                    {item.content}
                  </strong>
                  <dl>
                    {item.conditions && <><dt>조건</dt><dd>{item.conditions}</dd></>}
                    {item.units && <><dt>단위</dt><dd>{item.units}</dd></>}
                    {item.caution && <><dt>주의</dt><dd>{item.caution}</dd></>}
                  </dl>
                  {item.aliases.length > 0 && (
                    <div className="alias-row">
                      {item.aliases.map((alias) => <span key={alias}>{alias}</span>)}
                    </div>
                  )}
                  <small>눌러서 문제 보기</small>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      <section className="method-note">
        <div className="method-icon">≡</div>
        <div>
          <span className="eyebrow">빈도 계산 원칙</span>
          <h2>숫자만 바뀐 중복 문제는 한 번만 셉니다.</h2>
          <p>
            문제를 먼저 같은 유형의 family로 묶고, 그 안에서 실제 풀이에 필요한 공식과
            정답 근거 이론만 빈도에 반영합니다. 단순히 해설에 언급된 식은 보조 항목으로 분리합니다.
          </p>
        </div>
      </section>
    </div>
  );
}
