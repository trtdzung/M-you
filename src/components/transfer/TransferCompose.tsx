"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, QrCode } from "lucide-react";
import { useProviders } from "@/providers/context";
import { useJarConfig } from "@/state/jars";
import { useFinancials } from "@/state/useFinancials";
import { putTransferDraft } from "@/lib/transfer-draft-store";
import { assessTransferRisk } from "@/lib/transfer-risk";
import type { Account, Beneficiary, Transaction } from "@/domain/models";
import { TransferHeader } from "./TransferHeader";
import { type SelectedRecipient } from "./RecipientPicker";
import { TransferAccountPicker } from "./TransferAccountPicker";
import { TransferBankEntry } from "./TransferBankEntry";
import { TransferSaveRecipient } from "./TransferSaveRecipient";
import { TransferAmountStep } from "./TransferAmountStep";

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
  const [sourceAccountId, setSourceAccountId] = useState("");

  function selectRecipient(next: SelectedRecipient) {
    setRecipient(next);
    setStep("amount");
  }

  function backToPick() {
    setRecipient(null);
    setStep("pick");
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    Promise.all([providers.listBeneficiaries(), providers.listTransactions(), providers.listAccounts()])
      .then(([nextBeneficiaries, nextTransactions, nextAccounts]) => {
        if (!active) return;
        const eligibleAccounts = nextAccounts.filter((account) => account.type === "current");
        setBeneficiaries(nextBeneficiaries);
        setTransactions(nextTransactions);
        setAccounts(eligibleAccounts);
        setSourceAccountId(eligibleAccounts.find((account) => account.type === "current")?.id ?? eligibleAccounts[0]?.id ?? "");
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
  const selectedAccount = accounts.find((account) => account.id === sourceAccountId);
  const riskFlags = useMemo(() => assessTransferRisk({ amount: numericAmount, isNewPayee: recipient?.isNewPayee ?? false }), [numericAmount, recipient]);
  const canContinue = Boolean(recipient && Number.isFinite(numericAmount) && numericAmount > 0 && selectedAccount);

  function continueToConfirm() {
    if (!recipient || !canContinue || !selectedAccount) return;
    const id = `form_${Date.now()}`;
    putTransferDraft({
      id,
      name: recipient.name,
      accountMasked: recipient.accountMasked,
      amount: numericAmount,
      memo: memo.trim() || null,
      sourceLabel: `${selectedAccount.institution} · ${selectedAccount.type === "current" ? "Thanh toán" : "Tiết kiệm"}`,
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
    content = <TransferSaveRecipient onContinue={selectRecipient} onBack={() => setStep("pick")} />;
  } else if (recipient) {
    content = (
      <>
        {accounts.length === 0 && <p role="alert" className="mx-4 mb-2 text-sm text-negative">Không có tài khoản nguồn phù hợp để tạo bản nháp.</p>}
        <TransferAmountStep
          recipient={recipient}
          accounts={accounts}
          jars={jars}
          sourceAccountId={sourceAccountId}
          amount={amount}
          memo={memo}
          canContinue={canContinue}
          onChangeRecipient={backToPick}
          onSourceChange={setSourceAccountId}
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
