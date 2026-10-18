"use client";

import { useEffect, useMemo, useState } from "react";
import { useScreenEvent } from "@/components/security/useScreenEvent";
import { lastFourDigits, postSecurityEvent } from "@/lib/security/post-event";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Home, Lock, QrCode } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useProviders } from "@/providers/context";
import { useJarConfig } from "@/state/jars";
import { useFinancials } from "@/state/useFinancials";
import { useAutoFundWith } from "@/state/use-auto-fund";
import { transferNow } from "@/lib/demo-clock";
import { maskAccount } from "@/lib/mask-account";
import { putTransferDraft, type StoredTransferDraft } from "@/lib/transfer-draft-store";
import { isNavigationTransitionPending, navigateWithTransition, backWithTransition, pushWithTransition } from "@/lib/view-transition";
import { assessTransferRisk } from "@/lib/transfer-risk";
import { useSecurityStore } from "@/state/security/store";
import { isTransferBlocked } from "@/state/security/selectors";
import { formatPendingAt } from "@/components/settings/security/pending";
import { formatVnd } from "@/lib/format";
import { casaBalance, casaBalanceOrUnknown, computeUnallocatedPool, evaluateFunding, jarSpendable, type JarSpendable } from "@/domain/engine";
import type { Account, Beneficiary, Transaction } from "@/domain/models";
import { TransferHeader } from "./TransferHeader";
import { type SelectedRecipient } from "./RecipientPicker";
import { TransferAccountPicker } from "./TransferAccountPicker";
import { TransferBankEntry } from "./TransferBankEntry";
import { TransferSaveRecipient } from "./TransferSaveRecipient";
import { TransferAmountStep, POOL_SOURCE_LABEL, type TransferSource } from "./TransferAmountStep";
import { SheetSlot, useRetained } from "@/components/primitives";
import { AgentTopupSheet } from "./AgentTopupSheet";

type Step = "pick" | "bank-entry" | "save-recipient" | "amount";

export function TransferCompose() {
  useScreenEvent("transfer_screen_open");
  const providers = useProviders();
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    router.prefetch?.("/transfer-confirm");
  }, [router]);
  const { config: jarConfig, loaded: jarsLoaded } = useJarConfig();
  const fin = useFinancials();
  const { financials } = fin;
  // Same txn view `useFinancials` already loaded — no second fetch.
  const autoFund = useAutoFundWith({ transactions: fin.transactions, raw: fin.raw });
  // S10/U7: the SAME clock Confirm assesses with and posts the txn at, so the
  // funding verdict here is always for the posted txn's month (not the viewed one).
  const postedAt = useMemo(() => transferNow().toISOString(), []);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [recipient, setRecipient] = useState<SelectedRecipient | null>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [source, setSource] = useState<TransferSource | null>(null);
  // Category an agent-proposed transfer (Feature 3) arrived with — this screen
  // has no category field of its own (that's only ever picked post-transfer,
  // `TransferCategorizeSection`), so it just rides along to `writeDraftAndGo`.
  const [agentCategoryId, setAgentCategoryId] = useState<string | undefined>(undefined);

  function selectRecipient(next: SelectedRecipient) {
    postSecurityEvent("recipient_entered", {
      recipientName: next.name,
      recipientLast4: lastFourDigits(next.accountNumber ?? next.accountMasked),
      recipientBank: next.bankName ?? "",
    });
    setRecipient(next);
    setStep("amount");
  }

  function backToPick() {
    setRecipient(null);
    setStep("pick");
  }

  // "Lưu người nhận" (save-recipient step only) really persists the account —
  // advance the UI immediately (non-blocking) and sync the saved-beneficiary
  // list in the background so a later "Đổi" shows it under "Đã lưu" without a
  // reload. `TransferBankEntry` ("Tài khoản/Số thẻ") never calls this — it was
  // never a "save" action.
  function saveAndSelectRecipient(next: SelectedRecipient) {
    selectRecipient(next);
    providers
      .createBeneficiary({ name: next.name, accountNumber: next.accountNumber, bankName: next.bankName ?? "" })
      .then(setBeneficiaries)
      .catch(() => {});
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setBeneficiaries([]);
    setTransactions([]);
    setAccounts([]);
    setSource(null);
    setError(false);
    Promise.all([
      providers.listBeneficiaries(),
      providers.listTransactions(),
      providers.listAccounts(),
    ])
      .then(([nextBeneficiaries, nextTransactions, nextAccounts]) => {
        if (!active) return;
        // Balances are DB-backed and already reflect prior transfer debits.
        const eligibleAccounts = nextAccounts.filter((account) => account.type === "current");
        setBeneficiaries(nextBeneficiaries);
        setTransactions(nextTransactions);
        setAccounts(eligibleAccounts);
        setSource(eligibleAccounts[0] ? { kind: "account", id: eligibleAccounts[0].id } : null);

        // Agent-proposed prefill (Feature 3, `AgentTransferFormCard`): a saved
        // beneficiary id + optional amount/note/category in the query string
        // jumps straight to the amount step, same as picking that recipient by
        // hand — recipient identity always comes from THIS fresh fetch, never
        // from the query string itself (invariant #3, no fabricated accounts).
        const beneficiaryId = params?.get("beneficiaryId");
        const match = beneficiaryId ? nextBeneficiaries.find((b) => b.id === beneficiaryId) : undefined;
        if (match) {
          selectRecipient({
            name: match.name,
            accountMasked: maskAccount(match.accountNumber),
            accountNumber: match.accountNumber,
            source: "saved_beneficiary",
            isNewPayee: false,
            bankName: match.bankName,
          });
          const amountParam = params?.get("amount");
          if (amountParam) setAmount(amountParam);
          const noteParam = params?.get("note");
          if (noteParam) setMemo(noteParam);
          const categoryParam = params?.get("category");
          if (categoryParam) setAgentCategoryId(categoryParam);
        }
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill from the query string only ever applies once, at the initial load
  }, [providers]);

  // The single derived quantity every jar number keys off (invariant #1): the
  // engine's jar snapshot for the POSTED txn's month (`snapshotAt`, the same one
  // Confirm assesses on — S10/U7). `spendable = max(0, balance)`; null (no
  // limit) is non-fundable ("Chưa có số dư"), never a fabricated 0 (#6).
  const snapshot = useMemo(() => (financials ? autoFund.snapshotAt(postedAt) : null), [financials, autoFund, postedAt]);
  const jarSpendables = useMemo<JarSpendable[]>(() => snapshot?.spendables ?? [], [snapshot]);

  const jars = useMemo(
    () =>
      jarConfig.jars.map((jar) => {
        const line = snapshot?.lines.find((l) => l.huId === jar.id);
        const balance = line?.balance ?? null;
        // `spent`/`limit` are this month's (the snapshot's month), shown small under the balance.
        return { ...jar, balance, spendable: jarSpendable(balance), spent: line?.spent ?? null, limit: line?.limit ?? null };
      }),
    [jarConfig, snapshot],
  );

  const numericAmount = Number(amount);
  const selectedAccount = source?.kind === "account" ? accounts.find((account) => account.id === source.id) : undefined;
  const selectedJar = source?.kind === "jar" ? jars.find((jar) => jar.id === source.id) : undefined;
  // The virtual "Chưa phân bổ" pool — computed HERE from the shared selector on
  // the already-current-filtered `accounts` (never via useFinancials' unfiltered
  // RawData.accounts — RT#9), and only once jars have loaded AND financials have
  // arrived (else `spendableTotal: 0` would report the whole CASA as unallocated
  // — RT#14). Σ derived spendable, the same number the overview shows. No CASA
  // account → `amount: "unknown"` (invariant #6), never a fabricated 0.
  const pool = useMemo(
    () =>
      jarsLoaded && financials
        ? computeUnallocatedPool({
            casaBalance: casaBalanceOrUnknown(accounts),
            spendableTotal: jarSpendables.reduce((sum, jar) => sum + (jar.spendable ?? 0), 0),
          })
        : null,
    [jarsLoaded, financials, accounts, jarSpendables],
  );

  // Funding assessment for jar/pool sources (RT — Câu 2). An account source is a
  // plain balance check (no jar-model shortfall). `undefined` = account source.
  const fundingSourceJarId = source?.kind === "jar" ? source.id : source?.kind === "pool" ? null : undefined;
  const assessment = useMemo(() => {
    if (source?.kind === "account" || !jarsLoaded || !financials || !(numericAmount > 0)) return null;
    return evaluateFunding({
      amount: numericAmount,
      sourceJarId: fundingSourceJarId ?? null,
      casaBalance: casaBalance(accounts),
      jars: jarSpendables,
    });
  }, [source?.kind, fundingSourceJarId, jarsLoaded, financials, numericAmount, accounts, jarSpendables]);

  const accountSourceValid = source?.kind === "account" && Boolean(selectedAccount && numericAmount <= selectedAccount.balance);
  const insufficient = assessment?.tier === "insufficient";
  // Continue is allowed when: an account source has the balance, OR a jar/pool
  // source is `ok`, `topup` (popup), or goal-coverable (confirmed on Confirm).
  const canContinue = Boolean(
    !loading && !error && recipient &&
      Number.isFinite(numericAmount) &&
      numericAmount > 0 &&
      (source?.kind === "account" ? accountSourceValid : assessment !== null && !insufficient),
  );
  const [topupOpen, setTopupOpen] = useState(false);
  const heldTopup = useRetained(topupOpen && assessment?.tier === "topup" ? assessment : null);
  const riskFlags = useMemo(() => assessTransferRisk({ amount: numericAmount, isNewPayee: recipient?.isNewPayee ?? false }), [numericAmount, recipient]);
  // Scam Shield: a lock the customer set blocks the flow before confirm.
  const lockState = useSecurityStore(useShallow(state => ({ accountLocked: state.accountLocked, transferLockUntil: state.transferLockUntil })));
  const block = isTransferBlocked(lockState, transferNow().getTime());

  /** Write the draft (with an optional planned reallocation) and navigate to confirm. */
  function writeDraftAndGo(extras: Pick<StoredTransferDraft, "plannedReallocation"> = {}) {
    if (!recipient || block.blocked || isNavigationTransitionPending()) return;
    const id = `form_${Date.now()}`;
    putTransferDraft({
      id,
      name: recipient.name,
      accountMasked: recipient.accountMasked,
      accountNumber: recipient.accountNumber,
      recipientBankName: recipient.bankName,
      amount: numericAmount,
      memo: memo.trim() || null,
      sourceLabel: selectedJar
        ? `Hũ ${selectedJar.label}`
        : source?.kind === "pool"
          ? POOL_SOURCE_LABEL
          : `${selectedAccount!.institution} · ${selectedAccount!.type === "current" ? "Thanh toán" : "Tiết kiệm"}`,
      // Jar money physically sits in the CASA account, so a jar source debits the
      // (single, current-only `accounts`) CASA account too; an account source
      // debits the account the user picked. A pool source debits the CASA account
      // with NO `sourceJarId` (like no-jar today: the account drops, the derived
      // pool self-shrinks).
      sourceAccountId: selectedAccount?.id ?? accounts[0]?.id,
      sourceJarId: selectedJar?.id,
      sourceKind: source?.kind,
      recipientSource: recipient.source,
      riskFlags,
      categoryId: agentCategoryId,
      source: "mock",
      ...extras,
    });
    navigateWithTransition(
      () => router.push(`/transfer-confirm?draftId=${encodeURIComponent(id)}&from=transfer`),
      "forward",
    );
  }

  function continueToConfirm() {
    if (!recipient || !canContinue) return;
    // Account source, or a jar/pool source that already has enough → straight to
    // confirm. A `topup` opens the suggestion popup; `insufficient` is blocked.
    if (source?.kind === "account" || assessment?.tier === "ok") {
      writeDraftAndGo();
    } else if (assessment?.tier === "topup") {
      setTopupOpen(true);
    }
  }

  let content: React.ReactNode;
  if (step === "pick") {
    content = (
      <TransferAccountPicker
        loading={loading}
        loadError={error}
        beneficiaries={beneficiaries}
        transactions={transactions}
        onSelectRecipient={selectRecipient}
        onEnterBankDetails={() => setStep("bank-entry")}
        onAddRecipient={() => setStep("save-recipient")}
      />
    );
  } else if (step === "bank-entry") {
    content = <TransferBankEntry onContinue={selectRecipient} beneficiaries={beneficiaries} transactions={transactions} loading={loading} loadError={error} />;
  } else if (step === "save-recipient") {
    content = <TransferSaveRecipient onContinue={saveAndSelectRecipient} />;
  } else if (recipient) {
    content = (
      <>
        {loading && <p role="status" className="mx-4 mb-2 text-sm text-muted">Đang tải tài khoản nguồn…</p>}
        {!loading && accounts.length === 0 && <p role="alert" className="mx-4 mb-2 text-sm text-negative">Không có tài khoản nguồn phù hợp để tạo bản nháp.</p>}
        {insufficient && (
          <p role="alert" className="mx-4 mb-2 text-sm text-negative">
            Không đủ số dư để chuyển số tiền này.
          </p>
        )}
        <TransferAmountStep
          recipient={recipient}
          accounts={accounts}
          jars={jars}
          pool={pool}
          source={source}
          amount={amount}
          memo={memo}
          canContinue={!loading && !error && canContinue && !block.blocked}
          onChangeRecipient={backToPick}
          onSourceChange={setSource}
          onAmountChange={setAmount}
          onMemoChange={setMemo}
          onContinue={continueToConfirm}
        />
        <SheetSlot open={topupOpen && assessment?.tier === "topup"}>
          {heldTopup && heldTopup.tier === "topup" && (
          <AgentTopupSheet
            open={topupOpen && assessment?.tier === "topup"}
            assessment={heldTopup}
            jarId={selectedJar?.id ?? null}
            targetLabel={selectedJar ? `Hũ ${selectedJar.label}` : POOL_SOURCE_LABEL}
            jars={jarSpendables ?? []}
            casaBalance={casaBalance(accounts)}
            onClose={() => setTopupOpen(false)}
            onAccept={(plannedReallocation) => {
              setTopupOpen(false);
              writeDraftAndGo({ plannedReallocation });
            }}
            onChooseAnother={() => setTopupOpen(false)}
          />
          )}
        </SheetSlot>
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {step === "pick" ? (
        <TransferHeader onBack={() => backWithTransition(() => router.back())} rightIcon={<QrCode size={20} strokeWidth={2} />} rightLabel="Quét QR" />
      ) : (
        <TransferHeader
          onBack={backToPick}
          title={step === "save-recipient" ? "Lưu người nhận" : "Chuyển tiền"}
          rightIcon={<Home size={20} strokeWidth={2} />}
          rightLabel="Về trang chủ"
          onRightClick={() => pushWithTransition((href) => router.push(href), "/")}
        />
      )}
      {block.blocked && (
        <div role="status" className="mx-4 mb-2 flex gap-3 rounded-[20px] bg-negative-soft p-4 text-sm leading-relaxed">
          <Lock size={20} className="shrink-0 text-negative" aria-hidden />
          <p className="min-w-0 flex-1">
            {block.reason === "transfer-locked" && block.until !== undefined
              ? `Bạn đang khóa chuyển tiền ra ngoài đến ${formatPendingAt(block.until)}.`
              : "Tài khoản đang khóa tạm theo yêu cầu của bạn."}{" "}
            <Link href={block.reason === "transfer-locked" ? "/settings/transfer-lock" : "/settings/sos"} className="font-semibold text-primary underline underline-offset-4">Quản lý</Link>
          </p>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">{content}</div>
    </div>
  );
}
