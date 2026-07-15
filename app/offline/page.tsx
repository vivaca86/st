import type { Metadata } from "next";
import { OfflineWorkspace } from "../../components/OfflineWorkspace";

export const metadata: Metadata = {
  title: "오프라인 문제팩",
};

export default function OfflinePage() {
  return <OfflineWorkspace />;
}
