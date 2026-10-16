"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, Home, Lock, Share2, ShieldCheck, UserPlus } from "lucide-react";
import { Card } from "@/components/primitives";
import { formatDateTime } from "@/lib/format";
import { avatarColor, initialOf } from "@/lib/avatar";
import { findBank, findBankByName } from "@/lib/transfer-banks";
import { BankLogo } from "@/components/transfer/BankLogo";
import { TransferCategorizeSection } from "@/components/transfer/TransferCategorizeSection";
import { usePersona, useProviders } from "@/providers/context";
import { useJarConfig } from "@/state/jars";
import { useManualTxns } from "@/state/manual-txns";
import { useFinancials } from "@/state/useFinancials";
import { casaBalance, evaluateFunding, jarSpendable, POOL_DONOR_ID, type JarSpendable } from "@/domain/engine";
import { typeForCategory } from "@/lib/category-txn-type";
import { LOGIN_DISPLAY_NAME } from "@/components/login/LoginGate";
import { deleteTransferDraft, getTransferDraft, isTransferDraftUsed } from "@/lib/transfer-draft-store";
import { CATEGORY, CURRENCY_VND, type DataSource } from "@/domain/models";

/**
 * Mock MSB confirm screen — OUTSIDE the AI facade. The human edits every field,
 * enters a simulated OTP THEY type, and explicitly confirms. "Executing" here
 * only builds a local `source: "mock"` record; no facade/API is ever called and
 * the assistant never reaches this code. Cancel returns control with no effect.
 */

interface MockExecutedTransfer {
  recipientName: string;
  recipientAccountMasked: string;
  recipientAccountNumber: string | null;
  recipientBankName: string | null;
  senderName: string;
  amount: number;
  currency: string;
  memo: string | null;
  executedAt: string;
  transactionCode: string;
  referenceCode: string;
  source: DataSource; // always "mock" — never presented as a real MSB transfer
}

/** Comma-grouped, "VND" suffix — matches the real MSB receipt screen exactly (the rest of the app uses "₫"/period-grouping; this one screen deliberately doesn't). */
function formatVndComma(amount: number): string {
  return new Intl.NumberFormat("en-US").format(amount);
}

/** Uppercase, diacritics-stripped — matches the real app's auto-generated memo style (e.g. "NGUYEN VIET DUNG chuyen tien"). */
function toPlainUpper(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase();
}

export function TransferConfirm() {
  const router = useRouter();
  const params = useSearchParams();
  const providers = useProviders();
  const { config: jarConfig } = useJarConfig();
  const { add: addManualTxn } = useManualTxns();
  const { financials } = useFinancials();
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
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<MockExecutedTransfer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [recipientSaved, setRecipientSaved] = useState(false);
  // Categorization (phase 04): the txn recorded on confirm and its source jar.
  const [createdTxnId, setCreatedTxnId] = useState<string | null>(null);
  const [createdSourceJarId, setCreatedSourceJarId] = useState<string | null>(null);
  // Latches true the moment a txn is committed. A `useState` flag can't stop a
  // synchronous double-tap (both handlers read the same stale state) — the ref
  // does (Red Team F#3). Set only after validation so a failed attempt can retry.
  const committedRef = useRef(false);
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

  async function confirm() {
    // In-flight / already-done guard: a double-tap or re-entry must never create
    // a second txn or debit twice (Red Team F#3).
    if (committedRef.current || submitting || done) return;
    if (!isValidDraft) return setError("Không tìm thấy bản nháp chuyển tiền hợp lệ.");
    if (!name.trim()) return setError("Vui lòng nhập tên người nhận.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Số tiền không hợp lệ.");
    if (otp.trim().length < 4) return setError("Vui lòng nhập mã OTP (ít nhất 4 chữ số).");
    setError(null);
    committedRef.current = true; // latch before any await — blocks a synchronous re-entry
    setSubmitting(true);
    try {
      // Mock-only: no real money moves, no API call, no facade involvement.
      // Every transfer debits the real source account AND records self-reported
      // txn(s), so the balance shown everywhere (transfer picker, Tổng quan, net
      // worth) actually drops — the money leaves the account for real
      // (envelope-label model: hũ are labels on the CASA account). There is NO
      // stored jar balance any more: a jar's spendable = max(0, remaining) is
      // DERIVED from txn history (invariant #1), so the ONLY thing a jar-sourced
      // transfer does is book its spend into the jar's first category (which drops
      // that jar's derived `remaining`). Account/pool-sourced spend books into
      // "Chuyển khoản" (type:transfer, excluded from spend so it doesn't inflate
      // expense — invariant #6); the account debit alone shrinks the derived pool.
      //
      // Accepted top-up ("gợi ý rót", Approach A — spread-as-spend): charge each
      // JAR contributor its funding portion as a self-reported expense (source
      // jar's own portion + each donor's `take`), never mutating `budgetLimit`
      // (invariant #5). The pool portion needs NO txn — the account debit already
      // shrinks the derived pool by exactly `poolTake`.
      //
      // Do the fail-prone async work (re-validate → debit) BEFORE any local ledger
      // write, so a provider failure leaves nothing partially applied and the retry
      // (after the catch releases the latch) can't double-debit. Fetch accounts
      // ONLY when needed — a top-up/overspend re-check (needs casaBalance) or the
      // legacy source-account fallback.
      const sourceJarId = draft?.sourceJarId ?? null;
      const needsAccounts = Boolean(draft?.plannedReallocation || draft?.overspend || !draft?.sourceAccountId);
      const accounts = needsAccounts ? await providers.listAccounts() : [];

      // Derived per-jar spendable from the SAME jarBudget.lines every screen reads
      // (invariant #1) — the input to the fresh funding re-check and the top-up
      // charge plan below. No stored balance is consulted.
      const spendables: JarSpendable[] = (financials?.jarBudget.lines ?? []).map((line) => ({
        id: line.huId,
        label: line.label,
        categoryIds: line.categoryIds,
        spendable: jarSpendable(line.remaining),
      }));
      const spendableById = new Map(spendables.map((s) => [s.id, s.spendable]));

      // Top-up / overspend drafts assumed a shortfall computed at popup time. Re-run
      // the engine on the FRESHEST state (RT#2) so a drifted state can't let a stale
      // plan push charges past what CASA holds. The freshly-computed donor chain
      // (never the stale draft one) drives the charge plan (RT#1/#3/#4).
      let donorCharges: { categoryId: string; amount: number }[] = [];
      let acceptedTopup = false;
      if (draft?.plannedReallocation || draft?.overspend) {
        const assessment = evaluateFunding({
          amount,
          sourceJarId,
          casaBalance: casaBalance(accounts),
          jars: spendables,
        });
        if (assessment.tier === "insufficient") {
          committedRef.current = false;
          setSubmitting(false);
          return setError("Số dư không đủ để hoàn tất giao dịch. Vui lòng kiểm tra lại.");
        }
        // Apply the top-up ONLY when the user accepted it (`plannedReallocation`)
        // and the fresh assessment still needs one. "Bỏ qua, vượt hũ" (`overspend`)
        // explicitly DECLINED it — it falls through to the single-txn path so the
        // jar goes over-budget (remaining negative) and the pool absorbs the
        // shortfall. tier "ok" → state improved, no top-up needed either way.
        if (draft?.plannedReallocation && assessment.tier === "topup") {
          acceptedTopup = true;
          // Each JAR donor is charged its `take` into its first category (the pool
          // donor produces NO txn — the account debit already shrinks the pool).
          // Donors always have a category (category-less jars are excluded upstream).
          donorCharges = assessment.donors
            .filter((d) => d.jarId !== POOL_DONOR_ID)
            .map((d) => {
              const donorJar = jarConfig.jars.find((j) => j.id === d.jarId);
              return { categoryId: donorJar?.categoryIds[0] ?? CATEGORY.transfer, amount: d.take };
            });
        }
      }

      let accountToDebit = draft?.sourceAccountId ?? null;
      if (!accountToDebit) {
        // Legacy draft without an explicit source account → the single current account.
        accountToDebit = accounts.find((a) => a.type === "current")?.id ?? null;
      }
      if (accountToDebit) await providers.applyAccountDebit(accountToDebit, amount);

      // Build the charge list. The FIRST charge is the categorizable ("primary")
      // txn shown on the success card:
      //  - jar source: its own portion into its first category. On an accepted
      //    top-up that portion is min(amount, spendable) so `remaining` lands
      //    exactly at the limit (not over); ok/overspend charge the full amount.
      //  - pool/account source: the full amount into "Chuyển khoản" (type:transfer,
      //    excluded from spend); donor jar takes follow as expense txns.
      const sourceJar = sourceJarId ? jarConfig.jars.find((j) => j.id === sourceJarId) : undefined;
      const charges: { categoryId: string; amount: number }[] = [];
      if (sourceJarId) {
        const spendableSource = spendableById.get(sourceJarId) ?? 0;
        const primaryAmount = acceptedTopup ? Math.min(amount, spendableSource) : amount;
        charges.push({ categoryId: sourceJar?.categoryIds[0] ?? CATEGORY.transfer, amount: primaryAmount });
      } else {
        charges.push({ categoryId: CATEGORY.transfer, amount });
      }
      charges.push(...donorCharges);

      let primaryTxnId: string | null = null;
      for (const charge of charges) {
        if (charge.amount <= 0) continue; // a source already at its limit contributes 0
        const id = addManualTxn({
          amount: charge.amount,
          direction: "debit",
          categoryId: charge.categoryId,
          type: typeForCategory(charge.categoryId), // derived from kind, never hardcoded
          merchantName: name.trim(),
          postedAt: new Date().toISOString(),
          // Keep the memo as a signal for AI purpose suggestion (data, not a command).
          ...(draft?.memo ? { note: draft.memo } : {}),
        });
        if (primaryTxnId === null) primaryTxnId = id;
      }
      setCreatedTxnId(primaryTxnId);
      // Seeds the categorize section's allowed-category picker (constrained to the
      // source jar's categories); null for a pool/account source.
      setCreatedSourceJarId(sourceJarId);
      // Consume the draft immediately so a reload/replay can't resubmit (F#2).
      if (draftIdParam) deleteTransferDraft(draftIdParam);

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
        executedAt: new Date().toISOString(),
        transactionCode: `FT${stamp.slice(-9)}`,
        referenceCode: `MSB${stamp.slice(-6)}`,
        source: "mock",
      });
    } catch {
      // A provider/store failure must not permanently lock the flow: release the
      // latch so the user can retry, and surface the error.
      committedRef.current = false;
      setError("Không hoàn tất được giao dịch. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    const recipientBank = findBankByName(done.recipientBankName ?? undefined);
    const senderBank = findBank("msb");
    const memoText = done.memo ?? `${toPlainUpper(done.senderName)} chuyen tien`;
    return (
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[calc(var(--safe-area-top)+0.25rem)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/msb-logo.png" alt="MSB" className="h-7 w-auto" />
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="Về trang chủ"
            className="flex h-9 w-9 items-center justify-center rounded-full text-text transition-colors hover:bg-surface/80"
          >
            <Home size={20} strokeWidth={2} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          <Card className="flex flex-col" padding="none">
            <div className="flex items-start gap-3 px-5 pt-5 pb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon_success.png" alt="" aria-hidden className="mt-0.5 h-10 w-10 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-positive">Chuyển tiền thành công</p>
                <p className="mt-1 tabular-nums text-text">
                  <span className="text-2xl font-bold">{formatVndComma(done.amount)}</span>{" "}
                  <span className="text-base text-muted">{done.currency}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{formatDateTime(done.executedAt)}</p>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-border border-t border-border">
              <Row label="Người nhận">
                <div className="flex items-center gap-2.5">
                  {recipientBank ? (
                    <BankLogo bank={recipientBank} />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ background: avatarColor(done.recipientName) }}
                    >
                      {initialOf(done.recipientName)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-text">{toPlainUpper(done.recipientName)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {done.recipientBankName && <span>{done.recipientBankName} · </span>}
                      <span className="tabular-nums">{done.recipientAccountNumber ?? done.recipientAccountMasked}</span>
                    </p>
                  </div>
                </div>
              </Row>
              <Row label="Người chuyển">
                <div className="flex items-center gap-2.5">
                  {senderBank && <BankLogo bank={senderBank} />}
                  <p className="truncate text-[15px] font-bold text-text">{toPlainUpper(done.senderName)}</p>
                </div>
              </Row>
              <Row label="Nội dung">
                <p className="text-sm text-text">{memoText}</p>
              </Row>
              <Row label="Phí (bao gồm VAT)">
                <p className="text-sm text-text">Miễn phí</p>
              </Row>
            </div>

            {createdTxnId && (
              <TransferCategorizeSection txnId={createdTxnId} sourceJarId={createdSourceJarId} amount={done.amount} />
            )}

            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="flex items-center justify-center gap-1 border-b border-border py-3 text-sm font-semibold text-primary"
            >
              {showDetails ? "Ẩn chi tiết" : "Chi tiết giao dịch"}
              {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showDetails && (
              <div className="flex flex-col divide-y divide-border border-b border-border">
                <Row label="Hình thức">
                  <p className="text-sm text-text">Chuyển nhanh 24/7</p>
                </Row>
                <Row label="Mã giao dịch">
                  <p className="text-sm tabular-nums text-text">{done.transactionCode}</p>
                </Row>
                <Row label="Mã tham chiếu">
                  <p className="text-sm tabular-nums text-text">{done.referenceCode}</p>
                </Row>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => {}}
                className="flex flex-col items-center gap-1.5 text-primary"
              >
                <Share2 size={20} strokeWidth={1.8} />
                <span className="text-xs font-medium text-text">Chia sẻ</span>
              </button>
              <button
                type="button"
                onClick={saveRecipient}
                disabled={recipientSaved}
                className="flex flex-col items-center gap-1.5 text-primary disabled:text-positive"
              >
                <UserPlus size={20} strokeWidth={1.8} />
                <span className="text-xs font-medium text-text">{recipientSaved ? "Đã lưu" : "Lưu người nhận"}</span>
              </button>
            </div>
          </Card>

          <button
            type="button"
            onClick={() => router.push("/transfer")}
            className="mt-4 flex h-13 w-full items-center justify-center rounded-full bg-primary text-base font-bold text-primary-fg"
          >
            Giao dịch khác
          </button>
        </div>
      </div>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="text-xs text-muted">{label}</span>
      {children}
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
