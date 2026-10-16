"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, QrCode } from "lucide-react";
import { useProviders } from "@/providers/context";
import { useJarConfig } from "@/state/jars";
import { useFinancials } from "@/state/useFinancials";
import { applyAccountAdjustments } from "@/lib/account-adjustments";
import { putTransferDraft } from "@/lib/transfer-draft-store";
import { assessTransferRisk } from "@/lib/transfer-risk";
import type { Account, Beneficiary, Transaction } from "@/domain/models";
import { TransferHeader } from "./TransferHeader";
import { type SelectedRecipient } from "./RecipientPicker";
import { TransferAccountPicker } from "./TransferAccountPicker";
import { TransferBankEntry } from "./TransferBankEntry";
import { TransferSaveRecipient } from "./TransferSaveRecipient";
import { TransferAmountStep, type TransferSource } from "./TransferAmountStep";

type Step = "pick" | "bank-entry" | "save-recipient" | "amount";

export function TransferCompose() {
  const providers = useProviders();
  const router = useRouter();
  const { config: jarConfig } = useJarConfig();
  const { financials } = useFinancials();
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

  function selectRecipient(next: SelectedRecipient) {
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
    setError(false);
    Promise.all([
      providers.listBeneficiaries(),
      providers.listTransactions(),
      providers.listAccounts(),
      providers.getAccountAdjustments(),
    ])
      .then(([nextBeneficiaries, nextTransactions, nextAccounts, adjustments]) => {
        if (!active) return;
        const eligibleAccounts = applyAccountAdjustments(nextAccounts, adjustments).filter(
          (account) => account.type === "current",
        );
        setBeneficiaries(nextBeneficiaries);
        setTransactions(nextTransactions);
        setAccounts(eligibleAccounts);
        setSource(eligibleAccounts[0] ? { kind: "account", id: eligibleAccounts[0].id } : null);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [providers]);

  const jars = useMemo(
    () =>
      jarConfig.jars.map((jar) => ({
        ...jar,
        remaining: financials?.jarBudget.lines.find((line) => line.huId === jar.id)?.remaining ?? null,
      })),
    [jarConfig, financials],
  );

  const numericAmount = Number(amount);
  const selectedAccount = source?.kind === "account" ? accounts.find((account) => account.id === source.id) : undefined;
  const selectedJar = source?.kind === "jar" ? jars.find((jar) => jar.id === source.id) : undefined;
  const sourceValid =
    source?.kind === "jar"
      ? Boolean(selectedJar && selectedJar.actualAmount !== undefined && numericAmount <= selectedJar.actualAmount)
      : Boolean(selectedAccount);
  const riskFlags = useMemo(() => assessTransferRisk({ amount: numericAmount, isNewPayee: recipient?.isNewPayee ?? false }), [numericAmount, recipient]);
  const canContinue = Boolean(recipient && Number.isFinite(numericAmount) && numericAmount > 0 && sourceValid);

  function continueToConfirm() {
    if (!recipient || !canContinue) return;
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
        : `${selectedAccount!.institution} · ${selectedAccount!.type === "current" ? "Thanh toán" : "Tiết kiệm"}`,
      sourceJarId: selectedJar?.id,
      recipientSource: recipient.source,
      riskFlags,
      source: "mock",
    });
    router.push(`/transfer-confirm?draftId=${encodeURIComponent(id)}&from=transfer`);
  }

  let content: React.ReactNode;
  if (loading) {
    content = <p role="status" className="py-6 text-sm text-muted">Đang tải thông tin chuyển tiền…</p>;
  } else if (error) {
    content = <p role="alert" className="rounded-xl bg-negative-soft p-3 text-sm text-negative">Không thể tải thông tin lúc này. Vui lòng thử lại.</p>;
  } else if (step === "pick") {
    content = (
      <TransferAccountPicker
        beneficiaries={beneficiaries}
        transactions={transactions}
        onSelectRecipient={selectRecipient}
        onEnterBankDetails={() => setStep("bank-entry")}
        onAddRecipient={() => setStep("save-recipient")}
      />
    );
  } else if (step === "bank-entry") {
    content = <TransferBankEntry onContinue={selectRecipient} onBack={() => setStep("pick")} />;
  } else if (step === "save-recipient") {
    content = <TransferSaveRecipient onContinue={saveAndSelectRecipient} onBack={() => setStep("pick")} />;
  } else if (recipient) {
    content = (
      <>
        {accounts.length === 0 && <p role="alert" className="mx-4 mb-2 text-sm text-negative">Không có tài khoản nguồn phù hợp để tạo bản nháp.</p>}
        <TransferAmountStep
          recipient={recipient}
          accounts={accounts}
          jars={jars}
          source={source}
          amount={amount}
          memo={memo}
          canContinue={canContinue}
          onChangeRecipient={backToPick}
          onSourceChange={setSource}
          onAmountChange={setAmount}
          onMemoChange={setMemo}
          onContinue={continueToConfirm}
        />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {step === "pick" ? (
        <TransferHeader onBack={() => router.back()} rightIcon={<QrCode size={20} strokeWidth={2} />} rightLabel="Quét QR" />
      ) : (
        <TransferHeader
          onBack={() => router.back()}
          title={step === "save-recipient" ? "Lưu người nhận" : "Chuyển tiền"}
          rightIcon={<Home size={20} strokeWidth={2} />}
          rightLabel="Về trang chủ"
          onRightClick={() => router.push("/")}
        />
      )}
      <div className="flex min-h-0 flex-1 flex-col">{content}</div>
    </div>
  );
}
