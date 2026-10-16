"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, ShieldAlert, TriangleAlert } from "lucide-react";
import { formatVnd } from "@/lib/format";
import { SourceBadge } from "@/components/primitives";
import { putTransferDraft } from "@/lib/transfer-draft-store";
import type { TransferDraftView } from "@/ai/pipeline/events";
import type { TransferRiskFlag } from "@/domain/models";

const RISK_META: Record<TransferRiskFlag, { label: string; tone: "warning" | "negative" }> = {
  over_threshold: { label: "Vượt ngưỡng", tone: "warning" },
  new_payee: { label: "Người nhận mới", tone: "warning" },
  urgency_language: { label: "Có yếu tố gấp", tone: "negative" },
};

const SOURCE_LABEL: Record<TransferDraftView["recipientSource"], string> = {
  saved_beneficiary: "Người nhận đã lưu",
  transaction_history: "Từ lịch sử giao dịch",
  user_typed: "Số tài khoản bạn nhập",
};

/**
 * In-chat transfer DRAFT card. It is a review affordance only — tapping the CTA
 * navigates to the (mock) MSB confirm screen where the human edits, confirms, and
 * authenticates. This card never submits or executes anything. The draft fields
 * are handed off via session storage (Red Team #11), NOT the URL — only the draft
 * id travels in the query string.
 */
export function DraftCard({ draft }: { draft: TransferDraftView }) {
  const router = useRouter();

  function reviewAndConfirm() {
    putTransferDraft({
      id: draft.id,
      name: draft.recipientName,
      accountMasked: draft.recipientAccountMasked,
      amount: draft.amount,
      memo: draft.memo ?? null,
      sourceLabel: draft.sourceAccountLabel,
      recipientSource: draft.recipientSource,
      riskFlags: draft.riskFlags,
      source: "mock",
    });
    router.push(`/transfer-confirm?draftId=${encodeURIComponent(draft.id)}`);
  }

  return (
    <div className="shadow-card mt-2 rounded-[24px] bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Bản nháp chuyển tiền</span>
        <SourceBadge source="mock" />
      </div>

      <p className="mt-3 text-center text-[28px] font-bold leading-tight tabular-nums text-primary">
        {formatVnd(draft.amount)}
      </p>

      <dl className="mt-4 flex flex-col gap-2 border-t border-border pt-3 text-sm">
        <Field label="Người nhận" value={draft.recipientName} hint={SOURCE_LABEL[draft.recipientSource]} />
        <Field label="Số tài khoản" value={draft.recipientAccountMasked} mono />
        <Field label="Từ tài khoản" value={draft.sourceAccountLabel} />
        {draft.memo && <Field label="Nội dung" value={draft.memo} />}
      </dl>

      {draft.riskFlags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {draft.riskFlags.map((flag) => (
            <RiskChip key={flag} flag={flag} />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={reviewAndConfirm}
        className="brand-gradient mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        Xem &amp; xác nhận <ArrowRight size={15} />
      </button>

      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-muted">
        <ShieldAlert size={12} className="mt-0.5 shrink-0 text-primary" />
        Trợ lý chỉ soạn bản nháp. Bạn tự kiểm tra, xác nhận và nhập OTP trong luồng MSB — trợ lý không chuyển tiền.
      </p>
    </div>
  );
}

function Field({ label, value, hint, mono }: { label: string; value: string; hint?: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`text-right font-medium text-text ${mono ? "tabular-nums" : ""}`}>
        {value}
        {hint && <span className="block text-[11px] font-normal text-muted">{hint}</span>}
      </dd>
    </div>
  );
}

function RiskChip({ flag }: { flag: TransferRiskFlag }) {
  const meta = RISK_META[flag];
  const tone =
    meta.tone === "negative"
      ? "bg-negative-soft text-negative"
      : "bg-warning-soft text-warning";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      <TriangleAlert size={11} /> {meta.label}
    </span>
  );
}
