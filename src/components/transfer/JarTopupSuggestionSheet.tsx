"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { POOL_DONOR_ID, type DonorProposal, type FundingAssessment } from "@/domain/engine";

/** The M-You agent's take on this top-up, alongside the engine's own chain. */
export type AgentTopup =
  | { status: "idle" | "none" }
  | { status: "loading" }
  | { status: "ready"; donors: DonorProposal[]; /** One per jar the agent was asked about, in chain order. */ reasons: string[] };

/**
 * "Hũ thiếu tiền → gợi ý rót" popup. Every number (shortfall, each donor's take)
 * comes straight from the engine's `FundingAssessment` (invariant #1) — this
 * component only presents them and records the user's choice. It NEVER moves
 * money: "Đồng ý rót" attaches a PLANNED reallocation to the draft (applied
 * atomically at confirm, RT#1). Relabeling jars is an internal action; the
 * outward payment still runs the MSB confirm flow. There is NO "vượt hũ" escape
 * hatch — a jar can never be left over-budget-unfunded (plan 260918-1120): the
 * only choices are to fund it (Đồng ý rót) or pick another source.
 *
 * Copy is static (deterministic) for the MVP — Phase 03 may swap in an
 * AI-narrated line WITHOUT changing any figure.
 */
export function JarTopupSuggestionSheet({
  assessment,
  targetLabel,
  onAccept,
  onChooseAnother,
  onClose,
  agent = { status: "idle" },
}: {
  assessment: FundingAssessment;
  /** Optional agent suggestion: shown (and used by "Đồng ý rót") once `ready`. */
  agent?: AgentTopup;
  /** The jar (or pool) the shortfall funds, e.g. "Hũ Thiết yếu". */
  targetLabel: string;
  onAccept: () => void;
  onChooseAnother: () => void;
  onClose: () => void;
}) {
  // Double-tap guard (RT#10): latch on the first tap so a second synchronous tap
  // can't fire a second navigation / draft. Mirrors confirm()'s committedRef.
  const [pending, setPending] = useState(false);
  const guard = (fn: () => void) => () => {
    if (pending) return;
    setPending(true);
    fn();
  };
  // H17/U17: a pool source ("Chưa phân bổ", `targetJarId: null`) is NOT a jar —
  // the copy says the unallocated money is short and jars top it up (the
  // `toJarId: "pool"` leg itself is by design, E16).
  const poolSource = assessment.targetJarId === null;
  const shortfall = formatVnd(assessment.shortfall);
  const loading = agent.status === "loading";
  // While the agent decides, only the pool part (the engine's own) is shown; the rest is pending.
  const donors = agent.status === "ready" ? agent.donors : loading ? assessment.donors.filter((d) => d.jarId === POOL_DONOR_ID) : assessment.donors;
  const pendingAmount = loading ? assessment.shortfall - donors.reduce((sum, d) => sum + d.take, 0) : 0;

  return (
    <Sheet
      title={poolSource ? "Tiền chưa phân bổ không đủ" : "Hũ chưa đủ tiền"}
      description={
        poolSource
          ? `Còn thiếu ${shortfall} cho giao dịch này — lấy thêm từ hũ bên dưới.`
          : `${targetLabel} còn thiếu ${shortfall} cho giao dịch này.`
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted">
            {agent.status === "ready" && <Sparkles size={12} className="text-primary" aria-hidden />}
            {agent.status === "ready" ? "M-You gợi ý rót từ" : loading ? "Lấy từ tiền chưa phân bổ trước" : poolSource ? "Lấy thêm từ" : "Đề xuất rót từ"}
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {donors.map((donor) => (
              <li key={donor.jarId} className="flex items-center justify-between py-2">
                <span className="text-[15px] text-text">{donor.label}</span>
                <span className="text-[15px] font-semibold tabular-nums text-text">{formatVnd(donor.take)}</span>
              </li>
            ))}
            {loading && pendingAmount > 0 && (
              <li className="flex items-center justify-between py-2 text-muted">
                <span className="text-[15px]">Phần còn lại · chờ M-You chọn hũ</span>
                <span className="text-[15px] font-semibold tabular-nums">{formatVnd(pendingAmount)}</span>
              </li>
            )}
          </ul>
        </div>

        {loading && (
          <p role="status" className="flex items-start gap-1.5 text-xs text-muted">
            <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin" aria-hidden />
            Tiền chưa phân bổ chưa đủ — M-You đang chọn hũ cho phần còn lại (có thể mất chừng 20 giây).
          </p>
        )}
        {agent.status === "ready" && (
          <div className="flex flex-col gap-1">
            {agent.reasons.map((reason, i) => (
              <p key={i} className="text-xs text-text">{reason}</p>
            ))}
          </div>
        )}
        {agent.status === "none" && (
          <p className="text-xs text-muted">M-You chưa gợi ý được lúc này — dùng cách rót tự động ở trên.</p>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending || loading}
            onClick={guard(onAccept)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "Đang chờ M-You…" : <>Đồng ý rót <ArrowRight size={16} aria-hidden /></>}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={guard(onChooseAnother)}
            className="w-full rounded-full border border-border bg-surface px-4 py-3 text-sm font-semibold text-text disabled:opacity-60"
          >
            Chọn nguồn khác
          </button>
        </div>

        <p className="text-[11px] text-muted">
          Rót hũ chỉ đổi nhãn nội bộ. Giao dịch chuyển tiền vẫn cần bạn xác nhận ở bước sau.
        </p>
      </div>
    </Sheet>
  );
}
