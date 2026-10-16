"use client";

import Link from "next/link";
import { ArrowRight, ShieldAlert, TriangleAlert } from "lucide-react";
import { formatVnd } from "@/lib/format";
import { SourceBadge } from "@/components/primitives";
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

function confirmHref(draft: TransferDraftView): string {
  const params = new URLSearchParams({
    draftId: draft.id,
    name: draft.recipientName,
    acct: draft.recipientAccountMasked,
    amount: String(draft.amount),
    src: draft.sourceAccountLabel,
    source: draft.recipientSource,
  });
  if (draft.memo) params.set("memo", draft.memo);
  return `/transfer-confirm?${params.toString()}`;
}

/**
 * In-chat transfer DRAFT card. It is a review affordance only — tapping the CTA
 * navigates to the (mock) MSB confirm screen where the human edits, confirms, and
 * authenticates. This card never submits or executes anything.
 */
export function DraftCard({ draft }: { draft: TransferDraftView }) {
  return (
    <div className="shadow-card mt-2 rounded-[24px] bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Bản nháp chuyển tiền</span>
        <SourceBadge source="mock" />
      </div>

      <p className="mt-2 text-2xl font-bold tabular-nums text-primary">{formatVnd(draft.amount)}</p>

      <dl className="mt-3 flex flex-col gap-2 text-sm">
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

      <Link
        href={confirmHref(draft)}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
      >
        Xem lại &amp; xác nhận <ArrowRight size={15} />
      </Link>

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
