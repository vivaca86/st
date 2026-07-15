"use client";

import { useEffect, useState } from "react";
import { subjectName } from "../lib/subjects";

type ReviewData = {
  queue: Array<{
    id: string;
    subject_code: string;
    source_page: number;
    source_question_no: string;
    stem: string;
    ocr_confidence: number;
    importance_score: number;
    importance_reason: string | null;
    source_document: string;
  }>;
  markCount: number;
  pendingMarkCount: number;
  mapping: { matchedPages: number; handwritingPages: number; coverage: number };
  confirmedExamples: Array<{
    document: string;
    page: number;
    questions: string;
    note: string;
  }>;
};

export function ImportanceReview() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/review")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "검수 현황을 불러오지 못했습니다.");
        return payload as ReviewData;
      })
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <div className="page-stack review-page">
      <section className="page-title-row">
        <div>
          <span className="eyebrow">필기 번호 ↔ 원본 문제 번호</span>
          <h1>중요문제 연결 검수</h1>
          <p>글씨 전체를 못 읽더라도 앞의 문제 번호와 “자주나옴·시험 잘나옴·중요” 표시는 연결합니다.</p>
        </div>
        <div className="coverage-orb">
          <strong>{data?.mapping.coverage ?? "–"}<small>%</small></strong>
          <span>구조 연결률</span>
        </div>
      </section>

      {error && <div className="notice notice-error">{error}</div>}
      {!data && !error && <div className="skeleton skeleton-hero" />}

      {data && (
        <>
          <section className="review-metrics">
            <article><span>필기 페이지</span><strong>{data.mapping.handwritingPages}</strong><small>전체 인식 후보</small></article>
            <article><span>문제 연결 가능</span><strong>{data.mapping.matchedPages}</strong><small>직접 또는 오프셋 매핑</small></article>
            <article><span>DB 중요 표시</span><strong>{data.markCount}</strong><small>현재 적재 완료</small></article>
            <article><span>사람 검수 대기</span><strong>{data.pendingMarkCount}</strong><small>복수 후보는 자동 확정 안 함</small></article>
          </section>

          <section>
            <div className="section-heading">
              <div><span className="eyebrow">표본 확인 완료</span><h2>실제로 번호가 맞았던 사례</h2></div>
              <span className="readiness-badge is-ready">연결 규칙 검증됨</span>
            </div>
            <div className="mapping-table" role="table" aria-label="필기와 문제 번호 매핑 사례">
              <div className="mapping-row mapping-head" role="row">
                <span>원본 문서</span><span>페이지</span><span>문제 번호</span><span>필기 내용</span><span>상태</span>
              </div>
              {data.confirmedExamples.map((example) => (
                <div className="mapping-row" role="row" key={`${example.document}-${example.page}`}>
                  <strong>{example.document}</strong>
                  <span>p.{example.page}</span>
                  <span>{example.questions}</span>
                  <span className="note-quote">{example.note}</span>
                  <span className="match-chip">일치</span>
                </div>
              ))}
            </div>
          </section>

          <section className="review-principles">
            <article>
              <span className="principle-no">A</span>
              <div><h3>빈출</h3><p>“자주나옴”, “시험 잘나옴”, 출제 횟수 메모를 양의 가중치로 저장합니다.</p></div>
            </article>
            <article>
              <span className="principle-no">B</span>
              <div><h3>암기</h3><p>“암기”, 밑줄, 공식 묶음은 출제 가중치와 별개로 암기노트 우선순위에 반영합니다.</p></div>
            </article>
            <article>
              <span className="principle-no">C</span>
              <div><h3>제외·낮은 빈도</h3><p>“안 나옴”이나 취소선은 중요도가 아니라 음의 신호로 따로 보존합니다.</p></div>
            </article>
          </section>

          <section>
            <div className="section-heading">
              <div><span className="eyebrow">검수 큐</span><h2>DB에 들어온 중요문제 후보</h2></div>
              <span className="toolbar-count">{data.queue.length}개</span>
            </div>
            {data.queue.length === 0 ? (
              <div className="empty-state compact">
                <span>★</span>
                <h2>매핑 규칙은 준비됐습니다</h2>
                <p>877개 필기 페이지를 일괄 가져오면 이곳에서 번호별로 확인하게 됩니다.</p>
              </div>
            ) : (
              <div className="review-queue">
                {data.queue.map((item) => (
                  <article key={item.id}>
                    <div><span>{subjectName(item.subject_code)}</span><small>{item.source_document} p.{item.source_page}</small></div>
                    <h3>{item.source_question_no}번 · {item.stem}</h3>
                    <p>{item.importance_reason ?? "중요도 또는 문항 내용 검수 필요"}</p>
                    <b>{Math.round(item.ocr_confidence * 100)}%</b>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
