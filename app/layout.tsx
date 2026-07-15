import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppShell } from "../components/AppShell";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const imageUrl = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: baseUrl,
    title: {
      default: "전산기 100",
      template: "%s · 전산기 100",
    },
    description:
      "전기기사 5과목 문제은행, 100문제 모의고사, 중요문제와 공식·이론 암기노트",
    openGraph: {
      title: "전산기 100",
      description: "노트에서 문제은행까지, 5과목을 한 번에 푸는 전기기사 학습실",
      type: "website",
      url: baseUrl,
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: "전산기 100" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "전산기 100",
      description: "5과목 × 20문제, 문제은행과 공식·이론 암기노트",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
