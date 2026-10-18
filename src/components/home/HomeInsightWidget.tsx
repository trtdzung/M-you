"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Sparkles } from "lucide-react";
import { Sheet } from "@/components/primitives/Sheet";
import { formatVnd } from "@/lib/format";
import { usePersona } from "@/providers/context";
import { useAssetLiabilities } from "@/state/assets";
import { useGoals } from "@/state/goals";
import { useJarConfig } from "@/state/jars";
import { useCorrections } from "@/state/corrections";
import { useManualTxns } from "@/state/manual-txns";
import type { HomeInsight, HomeInsightResult } from "@/insights/proactive/home-contract";
import { saveInsightDraft } from "@/insights/proactive/chat-handoff";

export function HomeInsightWidget() {
  const { persona } = usePersona();
  const profile = useAssetLiabilities();
  const goals = useGoals();
  const jars = useJarConfig();
  const corrections = useCorrections();
  const { manualTxns } = useManualTxns();
  const router = useRouter();
  const [result, setResult] = useState<{ key: string; insight: HomeInsight | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const close = useCallback(() => setExpanded(false), []);
  const ready = jars.loaded && corrections.loaded && !corrections.unsaved;
  const payload = JSON.stringify({ cif: persona.cif,
    profile: { assets: profile.assets, liabilities: profile.liabilities, goals: goals.goals,
      complete: !profile.dropped && !goals.dropped } });
  const revision = JSON.stringify([jars.config, corrections.corrections, manualTxns]);
  const resultKey = payload + revision;
  const insight = result?.key === resultKey && ready ? result.insight : null;

  useEffect(() => {
    const focus = () => setRefresh((n) => n + 1);
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setExpanded(false);
    if (!ready) return () => controller.abort();
    const deadline = setTimeout(() => {
      controller.abort();
      setResult(null);
      setError("Chưa tải được gợi ý. Thử lại");
      setLoading(false);
    }, 30_300);
    const timer = setTimeout(() => {
      void fetch("/api/proactive-insights/current", { method: "POST", headers: { "Content-Type": "application/json" },
        body: payload, signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("unavailable");
          const data: HomeInsightResult = await response.json();
          if (controller.signal.aborted) return;
          setResult({ key: resultKey, insight: data.insight });
          if (data.insight) void fetch("/api/proactive-insights/current", { method: "POST",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif: persona.cif,
              snapshotId: data.insight.snapshotId, event: "displayed" }) }).catch(() => {});
        })
        .catch(() => { if (!controller.signal.aborted) { setResult(null); setError("Chưa tải được gợi ý. Thử lại"); } })
        .finally(() => { clearTimeout(deadline); if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { clearTimeout(timer); clearTimeout(deadline); controller.abort(); };
  }, [ready, payload, resultKey, refresh, persona.cif]);


  function chat() {
    if (!insight) return;
    if (!saveInsightDraft(persona.cif, insight)) { setError("Chưa mở được câu hỏi. Vui lòng thử lại."); return; }
    router.push("/pfm?assistant=1&insight=1");
  }
  if (!insight) {
    return <>
      <section aria-label="Gợi ý tài chính" className="home-insight-card flex items-center">
        <button type="button" onClick={() => setExpanded(true)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left focus-visible:outline-primary">
          <Sparkles size={24} className="shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-text">Gợi ý tài chính</span><span className="block text-xs text-muted">M-Your · Chạm để xem chi tiết</span></span>
          <ChevronRight size={16} className="shrink-0 text-primary" aria-hidden />
        </button>
      </section>
      {expanded && <Sheet title="Gợi ý tài chính" onClose={close} className="home-insight-sheet">
        <p className="mb-4 text-sm text-muted">{error || (loading ? "Đang cập nhật gợi ý tài chính cho bạn." : "Hiện chưa có gợi ý mới cho bạn.")}</p>
        {error && <button type="button" onClick={() => setRefresh(n => n + 1)} className="login-submit">Thử lại</button>}
        <button type="button" onClick={() => router.push("/pfm")} className="home-insight-secondary mt-3">Xem tổng quan tài chính</button>
      </Sheet>}
    </>;
  }
  const amount = formatVnd(insight.candidate.metric.value);
  return <>
    <section aria-label="Gợi ý tài chính" className="home-insight-card flex items-center">
      <button type="button" onClick={() => setExpanded(true)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left focus-visible:outline-primary" aria-label={`Xem insight: ${insight.title}`}>
        <Sparkles size={24} className="shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-text">{insight.title}</span>
          <span className="block truncate text-xs text-muted">M-Your · {insight.candidate.confidence === "estimated" ? "Ước tính, xem chi tiết" : "Chạm để xem chi tiết"}</span></span>
        <ChevronRight size={16} className="shrink-0 text-primary" aria-hidden />
      </button>
    </section>
    {error && <p role="alert" className="text-xs text-white">{error}</p>}
    {expanded && <Sheet title={insight.title} onClose={close} className="home-insight-sheet">
      <p className="text-sm text-muted">{insight.body}</p>
      <div className="my-5 rounded-2xl border border-orange-100 bg-[#fff1ea] p-4"><p className="text-xs text-muted">{insight.candidate.metric.label}</p><p className="mt-2 text-2xl font-bold text-text">{amount}</p>
        {insight.candidate.confidence === "estimated" && <p className="mt-1 text-xs text-muted">Đây là ước tính dựa trên dữ liệu hiện có.</p>}</div>
      <div className="flex flex-col gap-2">
        {insight.candidate.action === "overview" && <button onClick={() => router.push("/pfm")} className="login-submit">Xem tổng quan</button>}
        <button onClick={chat} className="home-insight-secondary">{insight.candidate.topic === "allocation" ? "Chia tiền cùng M-Your" : insight.candidate.topic === "investment" ? "Tìm hiểu cùng M-Your" : "Xem cụ thể cùng M-Your"}</button>
      </div>
    </Sheet>}
  </>;
}
