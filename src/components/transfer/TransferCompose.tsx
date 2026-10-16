"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldAlert, TriangleAlert } from "lucide-react";
import { Card, SourceBadge } from "@/components/primitives";
import { useProviders } from "@/providers/context";
import { putTransferDraft } from "@/lib/transfer-draft-store";
import { assessTransferRisk } from "@/lib/transfer-risk";
import type { Account, Beneficiary, Transaction } from "@/domain/models";
import { AmountMemoFields } from "./AmountMemoFields";
import { RecipientPicker, type SelectedRecipient } from "./RecipientPicker";

export function TransferCompose() {
  const providers = useProviders();
  const router = useRouter();
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [recipient, setRecipient] = useState<SelectedRecipient | null>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    Promise.all([providers.listBeneficiaries(), providers.listTransactions(), providers.listAccounts()])
      .then(([nextBeneficiaries, nextTransactions, nextAccounts]) => {
        if (!active) return;
        const eligibleAccounts = nextAccounts.filter((account) => account.type !== "credit_card");
        setBeneficiaries(nextBeneficiaries);
        setTransactions(nextTransactions);
        setAccounts(eligibleAccounts);
        setSourceAccountId(eligibleAccounts.find((account) => account.type === "current")?.id ?? eligibleAccounts[0]?.id ?? "");
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [providers]);

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

  if (loading) return <p role="status" className="py-6 text-sm text-muted">Đang tải thông tin chuyển tiền…</p>;
  if (error) return <p role="alert" className="rounded-xl bg-negative-soft p-3 text-sm text-negative">Không thể tải thông tin lúc này. Vui lòng thử lại.</p>;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-start gap-2 bg-primary-soft/40">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-[11px] leading-snug text-muted">Bước này chỉ tạo bản nháp để bạn tự kiểm tra và xác nhận.</p>
      </Card>
      <Card><RecipientPicker beneficiaries={beneficiaries} transactions={transactions} onChange={setRecipient} /></Card>
      <Card><AmountMemoFields amount={amount} memo={memo} accounts={accounts} sourceAccountId={sourceAccountId} onAmountChange={setAmount} onMemoChange={setMemo} onSourceChange={setSourceAccountId} /></Card>
      {riskFlags.length > 0 && <Card className="flex items-start gap-2 bg-warning-soft" role="alert">
        <TriangleAlert size={17} className="mt-0.5 shrink-0 text-warning" />
        <div className="text-sm text-warning"><p className="font-semibold">Cần kiểm tra kỹ</p><p className="mt-0.5">{riskFlags.includes("over_threshold") ? "Số tiền từ ngưỡng cảnh báo trở lên. " : ""}{riskFlags.includes("new_payee") ? "Đây là người nhận mới." : ""}</p></div>
      </Card>}
      {accounts.length === 0 && <p role="alert" className="text-sm text-negative">Không có tài khoản nguồn phù hợp để tạo bản nháp.</p>}
      <button type="button" disabled={!canContinue} onClick={continueToConfirm} className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-45">
        Tiếp tục <ArrowRight size={16} />
      </button>
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted"><SourceBadge source="mock" /></div>
    </div>
  );
}
