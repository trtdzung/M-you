"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, TrendingUp } from "lucide-react";
import { savePendingChatMessage } from "@/insights/proactive/chat-handoff";
import { pushWithTransition } from "@/lib/view-transition";
import { usePersonaCif } from "@/providers/context";
import { useGoalInsight, useGoalInsightPending } from "../../../client/goal-insight-store";
import { card, ring, sectionTitle } from "../../shared/styles";

/**
 * Thẻ "M-You gợi ý" của mục tiêu. Hai phần do agent viết (pfm không tính gì): ô trên là điều M-You nhận thấy,
 * ô có màu bên dưới là gợi ý; "Chi tiết" gửi `question` của agent sang chat. Đọc từ kho `goal-insight-store` (nạp sẵn khi danh sách mục tiêu tải xong), nên mở chi tiết là có thẻ ngay.
 * Chưa có bản nào và agent lỗi thì ẩn cả thẻ (không hiện chữ thay thế).
 */

/** In đậm các con số (tiền, %, ngày) trong câu của agent. */
function emphasize(text: string): ReactNode[] {
  return text.split(/(\d[\d.,/]*(?:\s?(?:%|VND|triệu|tỷ))?)/).map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part));
}

export function GoalCoach({ goalId, goalName }: { goalId: string; goalName: string }) {
  const router = useRouter();
  const cif = usePersonaCif();
  const insight = useGoalInsight(goalId);
  const pending = useGoalInsightPending();

  // Chưa có thẻ: còn đang nạp / agent đang viết thì giữ chỗ cho thẻ; hết chờ mà vẫn không có thì ẩn.
  if (!insight && !pending) return null;
  if (!insight) {
    return (
      <section className={`${card} flex flex-col gap-3`} aria-label="M-You gợi ý cho mục tiêu" aria-busy="true">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon_agent.png" alt="" width={32} height={32} draggable={false} className="h-8 w-8 shrink-0 rounded-full" />
          <h2 className={sectionTitle}>M-You gợi ý</h2>
        </div>
        <p role="status" className="animate-pulse text-sm leading-6 text-muted">M-You đang xem xét mục tiêu của bạn…</p>
      </section>
    );
  }

  /** Xếp sẵn câu hỏi cho khung chat M-You (gửi ngay khi chat mở xong) rồi chuyển sang màn chat. */
  function askMyou() {
    if (!cif || !insight) return;
    // Câu hỏi do agent viết; bản lưu cũ chưa có thì dựng từ hai ô.
    const prompt = insight.question || `Về mục tiêu "${goalName}", M-You vừa nhận thấy: ${insight.observation} Gợi ý: ${insight.suggestion} Bạn giải thích chi tiết hơn và hướng dẫn mình cách thực hiện nhé.`;
    if (!savePendingChatMessage(cif, prompt)) return;
    pushWithTransition((href) => router.push(href), "/pfm?assistant=1");
  }

  return (
    <section className={`${card} flex flex-col gap-3`} aria-label="M-You gợi ý cho mục tiêu">
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon_agent.png" alt="" width={32} height={32} draggable={false} className="h-8 w-8 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <h2 className={sectionTitle}>M-You gợi ý</h2>
        </div>
      </div>

      <p className="text-sm leading-6 text-text">{emphasize(insight.observation)}</p>

      <div className="rounded-2xl bg-surface-tint px-3.5 py-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary-strong">
          <TrendingUp size={16} aria-hidden /> Gợi ý cho bạn
        </p>
        <p className="text-sm leading-5 text-text">
          {emphasize(insight.suggestion)}{" "}
          <button type="button" aria-label="Chi tiết: mở chat M-You" className={`inline-flex items-center rounded-sm align-baseline font-semibold text-primary-strong hover:underline ${ring}`} disabled={!cif} onClick={askMyou}>
            Chi tiết
            <ChevronRight size={16} aria-hidden className="shrink-0" />
          </button>
        </p>
      </div>
    </section>
  );
}
