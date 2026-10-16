"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { Card, SourceBadge } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { getTransferDraft } from "@/lib/transfer-draft-store";
import { CURRENCY_VND, type DataSource } from "@/domain/models";

/**
 * Mock MSB confirm screen — OUTSIDE the AI facade. The human edits every field,
 * enters a simulated OTP THEY type, and explicitly confirms. "Executing" here
 * only builds a local `source: "mock"` record; no facade/API is ever called and
 * the assistant never reaches this code. Cancel returns control with no effect.
 */

interface MockExecutedTransfer {
  recipientName: string;
  recipientAccountMasked: string;
  amount: number;
  currency: string;
  memo: string | null;
  executedAt: string;
  source: DataSource; // always "mock" — never presented as a real MSB transfer
}

export function TransferConfirm() {
  const router = useRouter();
  const params = useSearchParams();
  // Draft fields come from session storage keyed by id (Red Team #11) — never
  // from the URL. Only `draftId` is read from the query string.
  const draft = useMemo(() => getTransferDraft(params.get("draftId") ?? ""), [params]);
  const doneDestination = params.get("returnTo") === "/" || params.get("from") === "transfer" ? "/" : "/assistant";
  const isValidDraft = Boolean(draft?.name.trim() && draft.accountMasked && Number.isFinite(draft.amount) && draft.amount > 0);

  const [name, setName] = useState(draft?.name ?? "");
  const [acct] = useState(draft?.accountMasked ?? "");
  const [amount, setAmount] = useState<number>(draft?.amount ?? 0);
  const [memo, setMemo] = useState(draft?.memo ?? "");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<MockExecutedTransfer | null>(null);
  const sourceLabel = draft?.sourceLabel ?? "Tài khoản MSB";

  function confirm() {
    if (!isValidDraft) return setError("Không tìm thấy bản nháp chuyển tiền hợp lệ.");
    if (!name.trim()) return setError("Vui lòng nhập tên người nhận.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Số tiền không hợp lệ.");
    if (otp.trim().length < 4) return setError("Vui lòng nhập mã OTP (ít nhất 4 chữ số).");
    setError(null);
    // Mock-only: no real money moves, no API call, no facade involvement.
    setDone({
      recipientName: name.trim(),
      recipientAccountMasked: acct,
      amount,
      currency: CURRENCY_VND,
      memo: memo.trim() || null,
      executedAt: new Date().toISOString(),
      source: "mock",
    });
  }

  if (done) {
    return (
      <div className="relative isolate flex flex-col gap-4">
        {/* Nền "2/9" (Quốc khánh) rất nhạt — trang trí; số liệu vẫn trên card trắng. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-4 -top-1 -z-10 h-64 bg-[url('/brand/hero-2-9-wash.jpg')] bg-cover bg-center opacity-80 [mask-image:linear-gradient(to_bottom,black,transparent)]"
        />
        <Card className="mt-6 flex flex-col items-center gap-2 text-center">
          <CheckCircle2 size={40} className="text-positive" />
          <p className="text-lg font-semibold text-text">Đã ghi nhận</p>
          <p className="text-2xl font-bold tabular-nums text-primary">{formatVnd(done.amount)}</p>
          <p className="text-sm text-muted">
            {done.recipientName} · {done.recipientAccountMasked}
          </p>
          <SourceBadge source="mock" className="mt-1" />
        </Card>
        <button
          type="button"
          onClick={() => router.push(doneDestination)}
          className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white"
        >
          {doneDestination === "/" ? "Về trang chủ" : "Về trợ lý"}
        </button>
      </div>
    );
  }

  if (!isValidDraft) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="bg-warning-soft" role="alert">
          <p className="text-sm font-semibold text-warning">Không tìm thấy bản nháp hợp lệ</p>
          <p className="mt-1 text-xs text-warning">Để bảo vệ thông tin người nhận, hãy tạo lại bản nháp từ luồng chuyển tiền.</p>
        </Card>
        <button type="button" onClick={() => router.push(doneDestination === "/" ? "/transfer" : "/assistant")} className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white">
          {doneDestination === "/" ? "Tạo lại bản nháp" : "Về trợ lý"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-muted">
        <ArrowLeft size={16} /> Huỷ &amp; quay lại
      </button>

      <Card className="bg-primary-soft/40">
        <p className="flex items-start gap-2 text-xs text-text">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />
          Kiểm tra kỹ từng thông tin. Bạn là người xác nhận và nhập OTP, trợ lý không làm bước này.
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <Labeled label="Người nhận">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Labeled>
        <Labeled label="Số tài khoản">
          <input value={acct} readOnly className={`${inputCls} bg-surface-muted text-muted`} />
        </Labeled>
        <Labeled label="Số tiền (VND)">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className={`${inputCls} tabular-nums`}
          />
        </Labeled>
        <Labeled label="Nội dung">
          <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} placeholder="Tuỳ chọn" />
        </Labeled>
        <Labeled label="Từ tài khoản">
          <input value={sourceLabel} readOnly className={`${inputCls} bg-surface-muted text-muted`} />
        </Labeled>
      </Card>

      <Card className="flex flex-col gap-2">
        <Labeled label="Mã OTP">
          <div className="flex items-center gap-2">
            <Lock size={15} className="text-muted" />
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputMode="numeric"
              placeholder="Bạn tự nhập OTP"
              className={`${inputCls} tabular-nums`}
            />
          </div>
        </Labeled>
        <p className="text-[11px] text-muted">OTP do bạn tự nhập, không gửi đi đâu.</p>
      </Card>

      {error && <p className="text-sm text-negative">{error}</p>}

      <button
        type="button"
        onClick={confirm}
        className="rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
      >
        Xác nhận chuyển tiền
      </button>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary";

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
