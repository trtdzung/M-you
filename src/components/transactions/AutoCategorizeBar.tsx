"use client";

/**
 * Header affordance for auto-categorization: an on-demand "Gắn nhãn giúp tôi"
 * button, the run summary (Red Team #15 — auto changes to totals are announced,
 * never silent), the four data states, and the honest "chưa lưu" warning when a
 * label write to the server failed (Red Team #12). No confidence numbers are shown.
 */

import { Loader2, Sparkles, TriangleAlert, WandSparkles } from "lucide-react";
import { useAutoCategorize } from "@/state/auto-categorize";
import { useCorrections } from "@/state/corrections";

export function AutoCategorizeBar() {
  const { runNow, summary, status, todoCount } = useAutoCategorize();
  const { unsaved } = useCorrections();

  return (
    <div className="flex flex-col gap-2">
      {unsaved && (
        <p className="flex items-center gap-1.5 rounded-row bg-negative-soft px-3 py-2 text-xs text-negative">
          <TriangleAlert size={13} aria-hidden /> Chưa lưu được — thay đổi có thể mất khi tải lại trang.
        </p>
      )}

      {status === "insufficient" && (
        <p className="rounded-row bg-surface-muted px-3 py-2 text-xs text-muted">
          Trợ lý AI đang tắt — chỉ áp nhãn bạn từng dạy. Bật quyền AI trong Cài đặt để nhận gợi ý mới.
        </p>
      )}
      {status === "error" && (
        <div className="flex items-center justify-between gap-2 rounded-row bg-negative-soft px-3 py-2 text-xs text-negative">
          <span>Không gợi ý được nhãn. Thử lại?</span>
          <button type="button" onClick={() => void runNow()} className="font-semibold underline">
            Thử lại
          </button>
        </div>
      )}

      {todoCount > 0 && (
        <button
          type="button"
          onClick={() => void runNow()}
          disabled={status === "loading"}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary bg-primary-soft px-4 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary/10 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {status === "loading" ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden /> Đang gợi ý nhãn…
            </>
          ) : (
            <>
              <WandSparkles size={15} aria-hidden /> Gắn nhãn giúp tôi ({todoCount})
            </>
          )}
        </button>
      )}

      {summary && (
        <p className="flex flex-wrap items-center gap-1.5 rounded-row bg-primary-soft/60 px-3 py-2 text-xs text-primary-strong">
          <Sparkles size={13} aria-hidden />
          {summaryText(summary)}
        </p>
      )}
    </div>
  );
}

function summaryText(s: {
  memoryApplied: number;
  applied: number;
  pending: number;
  chunkErrors: number;
  skippedNoConsent: boolean;
}): string {
  const parts: string[] = [];
  const autoApplied = s.memoryApplied + s.applied;
  if (autoApplied > 0) parts.push(`${autoApplied} giao dịch đã được gắn nhãn, tổng đã cập nhật`);
  if (s.pending > 0) parts.push(`${s.pending} gợi ý chờ bạn xác nhận`);
  if (s.chunkErrors > 0) parts.push(`${s.chunkErrors} lô lỗi`);
  if (parts.length === 0) parts.push(s.skippedNoConsent ? "Chỉ áp nhãn đã học (AI đang tắt)" : "Không có gợi ý mới");
  return parts.join(" · ");
}
