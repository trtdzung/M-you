"use client";

import { useRouter } from "next/navigation";
import { formatVnd } from "@/lib/format";
import { maskAccount } from "@/lib/mask-account";
import { putTransferDraft } from "@/lib/transfer-draft-store";
import type { TransferFormUi } from "@/lib/agent-api";

/**
 * Renders a `TransferFormUi` (Feature 3, `ui.type === "transfer_form"`) —
 * a read-only proposal to pay down the customer's OWN credit-card debt.
 * Caller must have already validated the payload with `isTransferFormUi`
 * (see `agent-api.ts`); this component trusts its `form` prop is well-formed.
 *
 * The agent never executes a transfer (invariant #3) — confirming here only
 * hands the proposal to pfm's own real transfer-confirm screen (review, edit,
 * mock OTP, explicit confirm), the same screen a human-initiated transfer
 * uses. No source-account picker: a non-jar-sourced confirm here has no real
 * balance effect today, so skipping straight to `/transfer-confirm` costs
 * nothing the human doesn't get back on that screen anyway.
 */
export function AgentTransferFormCard({ form }: { form: TransferFormUi }) {
  const router = useRouter();

  function confirm() {
    const id = `agent_${Date.now()}`;
    putTransferDraft({
      id,
      name: form.recipient,
      accountMasked: maskAccount(form.account_number),
      accountNumber: form.account_number,
      recipientBankName: "MSB", // always the customer's own MSB card debt
      amount: form.amount,
      memo: form.note,
      sourceLabel: "Tài khoản thanh toán",
      recipientSource: "agent_proposed",
      source: "mock",
    });
    router.push(`/transfer-confirm?draftId=${encodeURIComponent(id)}`);
  }

  return (
    <div className="shadow-card mt-2 max-w-[85%] rounded-2xl bg-surface p-3.5">
      <p className="text-xs font-semibold text-muted">Đề xuất thanh toán</p>
      <p className="mt-1.5 truncate text-sm font-semibold text-text">{form.recipient}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-text">{formatVnd(form.amount)}</p>
      <p className="mt-1 line-clamp-2 text-xs text-muted">{form.note}</p>
      <button
        type="button"
        onClick={confirm}
        className="mt-3 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-fg"
      >
        Thanh toán ngay
      </button>
    </div>
  );
}
