"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        if (cancelled) return;
        const resourceUrls = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((value) => {
            try {
              const url = new URL(value);
              return url.origin === window.location.origin && !url.pathname.startsWith("/api/");
            } catch {
              return false;
            }
          });
        registration.active?.postMessage({
          type: "CACHE_URLS",
          urls: [window.location.pathname, ...resourceUrls],
        });
      })
      .catch(() => {
        // IndexedDB 문제팩은 서비스 워커를 지원하지 않는 환경에서도 계속 사용할 수 있다.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
