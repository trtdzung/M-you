"use client";

import { ShieldCheck } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Card, SectionHeader } from "@/components/primitives";
import { ErrorState, Loading } from "@/components/states";
import { InsightCard } from "@/components/insights/InsightCard";
import { ChatPanel } from "@/components/assistant/ChatPanel";
import { openerFromInsight } from "@/ai/proactive/openers";
import { useInsights } from "@/state/useInsights";

export default function AssistantPage() {
  const { loading, error, financials, visible, dismiss, snooze, markHelpful } = useInsights();
  // Seed one proactive opener from the top non-dismissed insight (respects snooze/dismiss).
  const opener = visible.length > 0 ? openerFromInsight(visible[0]) : null;

  return (
    <div>
      <ScreenHeader title="Trợ lý" subtitle="Giải thích số liệu — không thực hiện giao dịch" />

      {loading && <Loading />}
      {error && <ErrorState />}

      {!loading && !error && financials && (
        <div className="flex flex-col gap-6">
          <Card className="flex items-start gap-2.5 bg-primary-soft/40">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-xs text-text">
              Trợ lý chỉ đọc và giải thích dữ liệu của bạn. Trợ lý
              <span className="font-semibold"> không </span> chuyển tiền hay thực hiện giao dịch.
              Mỗi con số đều kèm nguồn.
            </p>
          </Card>

          <ChatPanel opener={opener} />

          <section>
            <SectionHeader title="Đáng chú ý" subtitle="Phát hiện tự động theo quy tắc" />
            {visible.length > 0 ? (
              <div className="flex flex-col gap-2">
                {visible.map((i) => (
                  <InsightCard key={i.id} insight={i} actions={{ dismiss, snooze, markHelpful }} />
                ))}
              </div>
            ) : (
              <Card>
                <p className="text-sm text-muted">Chưa có điểm nào đáng chú ý trong tháng này.</p>
              </Card>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
