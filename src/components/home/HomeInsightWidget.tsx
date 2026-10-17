"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Sparkles } from "lucide-react";
import { Sheet } from "@/components/primitives/Sheet";
import { formatVnd } from "@/lib/format";
import { usePersona } from "@/providers/context";
import { useJarTopup } from "@/state/jar-topup";
import { useAssetLiabilities } from "@/state/assets";
import { useGoals } from "@/state/goals";
import { useJarConfig } from "@/state/jars";
import { useCorrections } from "@/state/corrections";
import { useManualTxns } from "@/state/manual-txns";
import type { HomeInsight, HomeInsightResult } from "@/insights/proactive/home-contract";
import { saveInsightDraft } from "@/insights/proactive/chat-handoff";

export function HomeInsightWidget() {
  const { persona } = usePersona();
  const { topupTxns } = useJarTopup();
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
      complete: !profile.dropped && !goals.dropped },
    topups: topupTxns.map((t) => ({ jarId: t.rebalance?.toJarId, amount: t.amount })) });
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
    if (error) return <button className="rounded-xl bg-white/95 px-3 py-2 text-left text-xs text-muted" onClick={() => setRefresh((n) => n + 1)}>{error}</button>;
    return loading && ready ? <div role="status" className="rounded-xl bg-white/95 px-3 py-2 text-xs text-muted">M-Your đang xem tình hình tài chính…</div> : null;
  }
  const amount = formatVnd(insight.candidate.metric.value);
  return <>
    <section aria-label="Gợi ý tài chính" className="flex min-h-14 items-center rounded-[24px] border border-white/40 bg-white/70 px-2 shadow-card backdrop-blur-xl">
      <button type="button" onClick={() => setExpanded(true)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left focus-visible:outline-primary" aria-label={`Xem insight: ${insight.title}`}>
        <Sparkles size={18} className="shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-text">{insight.title}</span>
          <span className="block truncate text-[11px] text-muted">M-Your · {insight.candidate.confidence === "estimated" ? "Ước tính, xem chi tiết" : "Chạm để xem chi tiết"}</span></span>
        <ChevronRight size={16} className="shrink-0 text-primary" aria-hidden />
      </button>
    </section>
    {error && <p role="alert" className="text-xs text-white">{error}</p>}
    {expanded && <Sheet title={insight.title} onClose={close}>
      <p className="text-sm text-muted">{insight.body}</p>
      <div className="my-4 rounded-xl bg-orange-50 p-3"><p className="text-xs text-muted">{insight.candidate.metric.label}</p><p className="mt-1 text-xl font-semibold">{amount}</p>
        {insight.candidate.confidence === "estimated" && <p className="mt-1 text-xs text-muted">Đây là ước tính dựa trên dữ liệu hiện có.</p>}</div>
      <div className="flex flex-col gap-2">
        {insight.candidate.action === "overview" && <button onClick={() => router.push("/pfm")} className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white">Xem tổng quan</button>}
        <button onClick={chat} className="rounded-xl border border-primary px-4 py-3 text-sm font-semibold text-primary">{insight.candidate.topic === "allocation" ? "Chia tiền cùng M-Your" : insight.candidate.topic === "investment" ? "Tìm hiểu cùng M-Your" : "Xem cụ thể cùng M-Your"}</button>
      </div>
    </Sheet>}
  </>;
}
