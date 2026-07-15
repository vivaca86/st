"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/", label: "학습 홈", glyph: "⌂" },
  { href: "/exam", label: "100문제", glyph: "100" },
  { href: "/formulas", label: "공식·이론", glyph: "ƒ" },
  { href: "/review", label: "중요문제", glyph: "★" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="주 메뉴">
        <Link className="brand" href="/" aria-label="전산기 100 홈">
          <span className="brand-mark">전</span>
          <span>
            <strong>전산기 100</strong>
            <small>5과목 통합 문제은행</small>
          </span>
        </Link>

        <nav className="side-nav">
          {navigation.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                className={`nav-link${active ? " is-active" : ""}`}
                href={item.href}
                key={item.href}
                aria-current={active ? "page" : undefined}
              >
                <span className="nav-glyph" aria-hidden="true">
                  {item.glyph}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="profile-dot">V</div>
          <div>
            <strong>vivaca86</strong>
            <span>개인 학습실</span>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="mobile-header">
          <Link className="mobile-brand" href="/">
            <span className="brand-mark">전</span>
            <strong>전산기 100</strong>
          </Link>
          <span className="status-pill"><i /> DB 준비 중</span>
        </header>
        <main className="page-content">{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="모바일 주 메뉴">
        {navigation.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              className={active ? "is-active" : ""}
              href={item.href}
              key={item.href}
              aria-current={active ? "page" : undefined}
            >
              <span aria-hidden="true">{item.glyph}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
