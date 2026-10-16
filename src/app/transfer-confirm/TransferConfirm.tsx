"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Card } from "@/components/primitives";
import { usePersona, useProviders } from "@/providers/context";
import { useJarConfig } from "@/state/jars";
import { buildManualTxn, useManualTxns, type ManualTxnInput } from "@/state/manual-txns";
import { useFinancials } from "@/state/useFinancials";
import { useAutoFund, type FundResult } from "@/state/use-auto-fund";
import { formatVnd } from "@/lib/format";
import { transferNow } from "@/lib/demo-clock";
import { typeForCategory } from "@/lib/category-txn-type";
import { LOGIN_DISPLAY_NAME } from "@/components/login/LoginGate";
import { deleteTransferDraft, getTransferDraft, isTransferDraftUsed } from "@/lib/transfer-draft-store";
import { CATEGORY, CURRENCY_VND, type Transaction } from "@/domain/models";
import type { FundingAssessment } from "@/domain/engine";
import { TransferSuccess, type MockExecutedTransfer } from "./TransferSuccess";
import { TransferFundingPreview } from "./TransferFundingPreview";

/**
 * Mock MSB confirm screen — OUTSIDE the AI facade. The human edits every field
 * and explicitly confirms (no OTP step — dropped from this prototype). The
 * assistant never reaches this code. Cancel returns control with no effect.
 *
 * Write path (H14/U1): the debit and the primary txn are ONE server transaction
 * (`applyAccountDebit(..., record)`); only when it resolves is the txn adopted
 * locally and the receipt shown. Rebalance legs are then AWAITED — a failed leg
 * is surfaced on the receipt, never claimed as "Đã bù".
 *
 * Clock (S10/U7): the preview, the confirm-time assessment and the posted txn
 * all use `transferNow()` — the same clock Compose assessed with.
 */

/** Label for a pool-source lift target (the derived "Chưa phân bổ" pool). */
const POOL_TARGET_LABEL = "Chưa phân bổ";

export function TransferConfirm() {
  const router = useRouter();
  const params = useSearchParams();
  const providers = useProviders();
  const { config: jarConfig } = useJarConfig();
  const { adopt: adoptManualTxn, addPersisted } = useManualTxns();
  const { financials } = useFinancials();
  const autoFund = useAutoFund();
  const { persona } = usePersona();
  const senderName = LOGIN_DISPLAY_NAME[persona.cif] ?? persona.label;
  const draftIdParam = params.get("draftId") ?? "";
  // Draft fields come from session storage keyed by id (Red Team #11) — never
  // from the URL. Only `draftId` is read from the query string.
  const draft = useMemo(() => getTransferDraft(draftIdParam), [draftIdParam]);
  const isValidDraft = Boolean(draft?.name.trim() && draft.accountMasked && Number.isFinite(draft.amount) && draft.amount > 0);

  const [name, setName] = useState(draft?.name ?? "");
  const [acct] = useState(draft?.accountMasked ?? "");
  const [amount, setAmount] = useState<number>(draft?.amount ?? 0);
  const [memo, setMemo] = useState(draft?.memo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<MockExecutedTransfer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recipientSaved, setRecipientSaved] = useState(false);
  // Categorization (phase 04): the txn recorded on confirm and its source jar.
  const [createdTxnId, setCreatedTxnId] = useState<string | null>(null);
  const [createdSourceJarId, setCreatedSourceJarId] = useState<string | null>(null);
  // The auto-fund result (drives the success-card toast: donors + Hoàn tác/Đổi nguồn).
  const [fundResult, setFundResult] = useState<FundResult | null>(null);
  // A rebalance write that failed AFTER the debit (shown on the receipt, H14).
  const [fundError, setFundError] = useState<string | null>(null);
  // A goal-only shortfall needs an explicit confirm (requiresManualGoal) BEFORE any
  // spend is booked (C3) — never a silent goal raid. Holds the pending assessment.
  const [goalPrompt, setGoalPrompt] = useState<FundingAssessment | null>(null);
  // Latches true the moment a txn is committed. A `useState` flag can't stop a
  // synchronous double-tap (both handlers read the same stale state) — the ref
  // does (Red Team F#3). Set only after validation so a failed attempt can retry.
  const committedRef = useRef(false);
  // The primary record of the last attempt — reused on a retry of the SAME
  // transfer so the server's id-idempotency never double-debits a lost response.
  const attemptRef = useRef<Transaction | null>(null);
  const sourceLabel = draft?.sourceLabel ?? "Tài khoản MSB";

  function saveRecipient() {
    if (!done || recipientSaved) return;
    setRecipientSaved(true);
    providers
      .createBeneficiary({
        name: done.recipientName,
        accountNumber: done.recipientAccountNumber ?? done.recipientAccountMasked,
        bankName: done.recipientBankName ?? "",
      })
      .catch(() => {});
  }

  // The source's funding shape (draft-derived). A jar/pool source can be short and
  // gets auto-funded; an account source is a plain balance check (no jar model).
  const sourceJarId = draft?.sourceJarId ?? null;
  const sourceKind = draft?.sourceKind ?? (sourceJarId ? "jar" : "account");
  const fundable = sourceKind === "jar" || sourceKind === "pool";
  // A jar source funds ITS jar; a pool source lifts the derived "pool" (targetJarId null).
  const targetJarId = sourceKind === "jar" ? sourceJarId : null;

  // RT-fix (H6): the anticipated donor chain on the posted-month snapshot, so the
  // user reviews donor(s) + amount BEFORE confirming. Recomputed fresh at confirm.
  const preview = useMemo(() => {
    if (!fundable || !financials || !(amount > 0)) return null;
    const { assessment, snapshot } = autoFund.assess({ postedAt: transferNow().toISOString(), sourceJarId: targetJarId, amount });
    return assessment.tier === "ok" && amount <= snapshot.casaBalance ? null : { assessment, casaBalance: snapshot.casaBalance };
  }, [fundable, financials, amount, targetJarId, autoFund]);

  /** The primary record for this attempt (same id on a retry of the same transfer). */
  function primaryRecord(input: ManualTxnInput): Transaction {
    const prev = attemptRef.current;
    const fresh = buildManualTxn(input);
    const same = prev && prev.amount === fresh.amount && prev.merchantName === fresh.merchantName;
    const txn = same ? { ...fresh, id: prev.id } : fresh;
    attemptRef.current = txn;
    return txn;
  }

  async function runConfirm(goalOk: boolean) {
    // In-flight / already-done guard: a double-tap or re-entry must never create
    // a second txn or debit twice (Red Team F#3, RT-fix H1 idempotency).
    if (committedRef.current || submitting || done) return;
    if (!isValidDraft) return setError("Không tìm thấy bản nháp chuyển tiền hợp lệ.");
    if (!name.trim()) return setError("Vui lòng nhập tên người nhận.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Số tiền không hợp lệ.");
    setError(null);

    const postedAt = transferNow().toISOString();
    // RT-fix (C3) — ASSESS-THEN-COMMIT: resolve insufficient / goal FIRST, on the
    // pre-commit snapshot, and only debit + write once coverage is guaranteed.
    let assessment: FundingAssessment | null = null;
    if (fundable) {
      const assessed = autoFund.assess({ postedAt, sourceJarId: targetJarId, amount });
      assessment = assessed.assessment;
      const overCasa = amount > assessed.snapshot.casaBalance;
      if (overCasa || (assessment.tier === "insufficient" && !assessment.requiresManualGoal)) {
        return setError("Số dư không đủ để hoàn tất giao dịch. Vui lòng kiểm tra lại.");
      }
      if (assessment.requiresManualGoal && !goalOk) {
        // Only a protected `goal` jar can close the gap — explicit confirm BEFORE
        // any spend is booked. Re-enters via the prompt's "Xác nhận rút".
        setGoalPrompt(assessment);
        return;
      }
    }
    setGoalPrompt(null);
    const includeGoal = Boolean(assessment?.requiresManualGoal && goalOk);

    committedRef.current = true; // latch before any await — blocks a synchronous re-entry
    setSubmitting(true);
    // Book the primary spend at its FULL amount into its REAL category: jar source →
    // the jar's first category; pool/account → the agent category or "Chuyển khoản".
    const sourceJar = targetJarId ? jarConfig.jars.find((j) => j.id === targetJarId) : undefined;
    const primaryCategory = targetJarId ? sourceJar?.categoryIds[0] ?? CATEGORY.transfer : draft?.categoryId ?? CATEGORY.transfer;
    const input: ManualTxnInput = {
      amount,
      direction: "debit",
      categoryId: primaryCategory,
      type: typeForCategory(primaryCategory), // derived from kind, never hardcoded
      merchantName: name.trim(),
      postedAt,
      ...(draft?.memo ? { note: draft.memo } : {}),
    };
    let primaryTxnId: string;
    try {
      // A jar's money physically sits in CASA, so every source debits CASA.
      const needsAccounts = fundable || !draft?.sourceAccountId;
      const accounts = needsAccounts ? await providers.listAccounts() : [];
      const accountToDebit = draft?.sourceAccountId ?? accounts.find((a) => a.type === "current")?.id ?? null;
      if (accountToDebit) {
        const record = primaryRecord(input);
        await providers.applyAccountDebit(accountToDebit, amount, record); // atomic debit + insert
        adoptManualTxn(record);
        primaryTxnId = record.id;
      } else {
        primaryTxnId = await addPersisted(input); // nothing to debit — still awaited
      }
    } catch {
      // Nothing was debited or stored (atomic) → release the latch so the user can
      // retry; NO success screen and NO local txn.
      committedRef.current = false;
      setSubmitting(false);
      setError("Không hoàn tất được giao dịch. Vui lòng thử lại.");
      return;
    }

    // The money moved — from here on the receipt is true. Consume the draft now so
    // a reload/replay can't resubmit (F#2).
    if (draftIdParam) deleteTransferDraft(draftIdParam);
    setCreatedTxnId(primaryTxnId);
    setCreatedSourceJarId(targetJarId); // seeds the categorize picker; null for pool/account

    // Auto-fund the resulting shortfall from the SAME assessment, awaiting every leg.
    const targetLabel = sourceJar?.label ?? POOL_TARGET_LABEL;
    if (assessment && assessment.tier !== "ok") {
      try {
        const createdIds = await autoFund.commitPersisted({
          assessment,
          targetJarId,
          triggerTxnId: primaryTxnId,
          postedAt,
          origin: includeGoal ? "manual" : "auto",
          includeGoal,
        });
        if (createdIds.length > 0) {
          const donors = includeGoal ? [...assessment.donors, ...assessment.goalDonors] : assessment.donors;
          setFundResult({ status: "funded", donors, goalDonors: assessment.goalDonors, shortfall: assessment.shortfall, createdIds, targetJarId, targetLabel, postedAt });
        }
      } catch {
        const where = targetJarId ? `hũ ${targetLabel}` : targetLabel;
        setFundError(`Chưa bù được ${formatVnd(assessment.shortfall)} cho ${where} (lỗi lưu dữ liệu). Hũ đang vượt hạn mức — cần bù thủ công.`);
      }
    }

    const stamp = Date.now().toString();
    setDone({
      recipientName: name.trim(),
      recipientAccountMasked: acct,
      recipientAccountNumber: draft?.accountNumber ?? null,
      recipientBankName: draft?.recipientBankName ?? null,
      senderName,
      amount,
      currency: CURRENCY_VND,
      memo: memo.trim() || null,
      executedAt: postedAt,
      transactionCode: `FT${stamp.slice(-9)}`,
      referenceCode: `MSB${stamp.slice(-6)}`,
      source: "mock",
    });
    setSubmitting(false);
  }

  if (done) {
    return (
      <TransferSuccess
        done={done}
        fundResult={fundResult}
        fundError={fundError}
        createdTxnId={createdTxnId}
        createdSourceJarId={createdSourceJarId}
        recipientSaved={recipientSaved}
        onSaveRecipient={saveRecipient}
      />
    );
  }

  // Draft consumed after a completed transfer (F#2): a reload/replay must NOT
  // show an editable form again. Distinguish "already completed" from "no draft".
  if (!isValidDraft && draftIdParam && isTransferDraftUsed(draftIdParam)) {
    return (
      <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
        <ConfirmHeader />
        <Card role="status">
          <p className="text-sm font-semibold text-text">Giao dịch đã hoàn tất</p>
          <p className="mt-1 text-xs text-muted">Bản nháp này đã được sử dụng. Không thể xác nhận lại.</p>
        </Card>
        <div className="flex gap-2">
          <button type="button" onClick={() => router.push("/")} className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-text">
            Về trang chủ
          </button>
          <button type="button" onClick={() => router.push("/transfer")} className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white">
            Giao dịch khác
          </button>
        </div>
      </div>
    );
  }

  if (!isValidDraft) {
    return (
      <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
        <ConfirmHeader />
        <Card className="bg-warning-soft" role="alert">
          <p className="text-sm font-semibold text-warning">Không tìm thấy bản nháp hợp lệ</p>
          <p className="mt-1 text-xs text-warning">Để bảo vệ thông tin người nhận, hãy tạo lại bản nháp từ luồng chuyển tiền.</p>
        </Card>
        <button type="button" onClick={() => router.push("/transfer")} className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white">
          Tạo lại bản nháp
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <ConfirmHeader />

      <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-muted">
        <ArrowLeft size={16} /> Huỷ &amp; quay lại
      </button>

      <Card className="bg-primary-soft/40">
        <p className="flex items-start gap-2 text-xs text-text">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />
          Kiểm tra kỹ từng thông tin. Bạn là người xác nhận, trợ lý không làm bước này.
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

      {/* RT-fix (H6): review the anticipated auto-fund BEFORE confirming (H11: never an empty donor list). */}
      {preview && (
        <TransferFundingPreview
          assessment={preview.assessment}
          amount={amount}
          casaBalance={preview.casaBalance}
          poolSource={sourceKind === "pool"}
        />
      )}

      {error && <p className="text-sm text-negative">{error}</p>}

      {goalPrompt && (
        <Card className="bg-warning-soft" role="alertdialog" aria-label="Xác nhận rút hũ Mục tiêu">
          <p className="text-sm font-semibold text-warning">Cần rút từ hũ Mục tiêu</p>
          <p className="mt-1 text-xs text-warning">
            Chỉ còn hũ Mục tiêu đủ để bù {formatVnd(goalPrompt.shortfall)} cho giao dịch này. Bạn xác nhận rút?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => runConfirm(true)}
              className="flex-1 rounded-full bg-primary px-3 py-2 text-sm font-semibold text-white"
            >
              Xác nhận rút
            </button>
            <button
              type="button"
              onClick={() => setGoalPrompt(null)}
              className="flex-1 rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold text-text"
            >
              Để sau
            </button>
          </div>
        </Card>
      )}

      <button
        type="button"
        onClick={() => runConfirm(false)}
        disabled={submitting}
        className="rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {submitting ? "Đang xử lý…" : "Xác nhận chuyển tiền"}
      </button>
    </div>
  );
}

function ConfirmHeader() {
  return (
    <header>
      <h1 className="text-lg font-semibold text-text">Xác nhận chuyển tiền</h1>
      <p className="text-xs text-muted">Bạn kiểm tra, chỉnh sửa và tự xác nhận.</p>
    </header>
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
