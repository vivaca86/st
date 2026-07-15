"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardSubject } from "../lib/types";

type DashboardData = {
  subjects: DashboardSubject[];
  targetPerSubject: number;
  verifiedTotal: number;
  formulaCount: number;
  fullExamReady: boolean;
  ingestion: {
    verifiedSeed: number;
    reviewQueue: number;
    estimatedUniqueQuestions: number;
    handwritingMapped: number;
    handwritingTotal: number;
  };
};

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "현황을 불러오지 못했습니다.");
        return payload as DashboardData;
      })
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  if (error) {
    return (
      <section className="empty-state">
        <span>!</span>
        <h1>문제은행을 여는 중 문제가 생겼어요</h1>
        <p>{error}</p>
        <button className="button button-primary" onClick={() => location.reload()}>
          다시 시도
        </button>
      </section>
    );
  }

  if (!data) return <DashboardSkeleton />;

  const mappingRate = Math.round(
    (data.ingestion.handwritingMapped / data.ingestion.handwritingTotal) * 100,
  );

  return (
    <div className="dashboard page-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">전기기사 5과목 통합 문제은행</span>
          <h1>
            노트에 있던 문제를
            <br />진짜 시험처럼 풀어보세요.
          </h1>
          <p>
            과목당 20문제, 총 100문제. 중복은 묶고 별표와 “잘 나옴” 필기는
            중요도에 반영합니다.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary button-large" href="/exam">
              랜덤 시험 만들기 <span aria-hidden="true">→</span>
            </Link>
            <Link className="button button-quiet button-large" href="/formulas">
              암기노트 보기
            </Link>
          </div>
          <div className="hero-facts">
            <span><b>{data.verifiedTotal}</b> 검수 완료</span>
            <span><b>{data.ingestion.reviewQueue}</b> 검수 대기</span>
            <span><b>{mappingRate}%</b> 필기 연결</span>
          </div>
        </div>

        <div className="exam-orbit" aria-label="5과목 각각 20문제">
          <div className="orbit-core">
            <strong>100</strong>
            <span>총 문항</span>
          </div>
          {data.subjects.map((subject, index) => (
            <div className={`orbit-chip orbit-${index + 1}`} key={subject.code}>
              <b>20</b>
              <span>{subject.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="section-heading">
          <div>
            <span className="eyebrow">DB 준비 현황</span>
            <h2>과목별 검수 완료 문제</h2>
          </div>
          <span className={`readiness-badge${data.fullExamReady ? " is-ready" : ""}`}>
            {data.fullExamReady ? "100문제 출제 가능" : "검수본 구축 중"}
          </span>
        </div>

        <div className="subject-grid">
          {data.subjects.map((subject, index) => {
            const progress = Math.min(
              100,
              Math.round((subject.verifiedCount / data.targetPerSubject) * 100),
            );
            return (
              <article className="subject-card" key={subject.code}>
                <div className={`subject-index subject-tone-${index + 1}`}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="subject-card-copy">
                  <h3>{subject.name}</h3>
                  <p>
                    검수 완료 <b>{subject.verifiedCount}</b> · 대기 {subject.reviewCount}
                  </p>
                  <div className="progress-track" aria-label={`${progress}% 완료`}>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <strong className="subject-target">
                  {subject.verifiedCount}<small>/20</small>
                </strong>
              </article>
            );
          })}
        </div>
      </section>

      <section className="insight-grid">
        <article className="insight-card insight-dark">
          <span className="card-kicker">문제 DB</span>
          <strong>{data.ingestion.estimatedUniqueQuestions.toLocaleString()}</strong>
          <h3>중복 제거 전 초기 문제 후보</h3>
          <p>문제 가족으로 묶은 뒤 대표 문제만 실전 출제 후보가 됩니다.</p>
          <Link href="/review">검수 구조 보기 →</Link>
        </article>
        <article className="insight-card">
          <span className="card-kicker">필기 중요도</span>
          <strong>96.47%</strong>
          <h3>원본 문제 페이지 연결 가능</h3>
          <p>877개 필기 페이지 중 846개가 문제 번호와 구조적으로 연결됩니다.</p>
          <Link href="/review">중요문제 확인 →</Link>
        </article>
        <article className="insight-card">
          <span className="card-kicker">공식·이론</span>
          <strong>{data.formulaCount}</strong>
          <h3>현재 연결된 암기 카드</h3>
          <p>같은 공식의 다른 표기는 합치고 중복 문제는 빈도에서 한 번만 셉니다.</p>
          <Link href="/formulas">카드 넘겨보기 →</Link>
        </article>
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard page-stack" aria-label="현황 불러오는 중">
      <div className="skeleton skeleton-hero" />
      <div className="skeleton-row">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="skeleton skeleton-card" key={index} />
        ))}
      </div>
    </div>
  );
}
