"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { avatarColor, initialOf } from "@/lib/avatar";
import { findBankByName } from "@/lib/transfer-banks";
import { BankLogo } from "@/components/transfer/BankLogo";
import { useProviders } from "@/providers/context";
import { CATEGORIES } from "@/domain/models";
import type { Beneficiary } from "@/domain/models";
import type { TransferFormUi } from "@/lib/agent-api";

const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.kind === "expense");

const fieldClass =
  "w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
      {label}
      {children}
    </label>
  );
}

/**
 * Renders a `TransferFormUi` (Feature 3, `ui.type === "transfer_form"`) — a
 * proposal to transfer money to a recipient already in the customer's saved
 * beneficiaries. Caller must have already validated the payload's SHAPE with
 * `isTransferFormUi` (see `agent-api.ts`); this component still has to
 * resolve `beneficiary_id` itself against the live beneficiaries list — the
 * agent never sends the name/account number/bank directly (invariant #3, no
 * fabricated accounts), so a stale or unknown id is only caught here. The
 * recipient identity is shown read-only (a real bank logo takes the place of
 * a "Ngân hàng" field) — to change WHO the money goes to, "Chuyển" lands the
 * customer on the real Chuyển tiền form where "Đổi" re-picks a recipient the
 * normal way, matching how every other transfer in this app resolves one
 * (invariant #3 — never a free-typed account number here).
 *
 * Amount/note/category stay editable — the customer reviews/corrects the
 * agent's proposal, then "Chuyển" hands the (possibly edited) values to
 * `/transfer` (`TransferCompose`, prefilled via the query string) so the
 * SAME screen and steps as a human-initiated transfer apply (source-account
 * pick, "Tiếp tục", confirm) — no separate/short-circuited screen.
 */
export function AgentTransferFormCard({ form }: { form: TransferFormUi }) {
  const router = useRouter();
  const providers = useProviders();
  const [status, setStatus] = useState<"loading" | "not_found" | "ready">("loading");
  const [beneficiary, setBeneficiary] = useState<Beneficiary | null>(null);

  const [amount, setAmount] = useState(form.amount);
  const [note, setNote] = useState(form.note);
  const [category, setCategory] = useState(form.category);

  useEffect(() => {
    let active = true;
    providers
      .listBeneficiaries()
      .then((list) => {
        if (!active) return;
        const match = list.find((b) => b.id === form.beneficiary_id);
        if (!match) {
          setStatus("not_found");
          return;
        }
        setBeneficiary(match);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("not_found");
      });
    return () => {
      active = false;
    };
  }, [providers, form.beneficiary_id]);

  function confirm() {
    const query = new URLSearchParams({
      beneficiaryId: form.beneficiary_id,
      amount: String(amount),
      note,
      category,
    });
    router.push(`/transfer?${query.toString()}`);
  }

  if (status === "loading") {
    return (
      <div className="shadow-card mt-2 max-w-[85%] rounded-2xl bg-surface p-3.5">
        <p className="text-xs text-muted">Đang tải thông tin người nhận…</p>
      </div>
    );
  }

  if (status === "not_found" || !beneficiary) {
    return (
      <div className="shadow-card mt-2 max-w-[85%] rounded-2xl bg-surface p-3.5">
        <p className="text-xs text-negative">Không tìm thấy người nhận đã lưu này.</p>
      </div>
    );
  }

  const canSubmit = Number.isFinite(amount) && amount > 0;
  const bank = findBankByName(beneficiary.bankName);

  return (
    <div className="shadow-card mt-2 flex w-[85%] flex-col gap-2 rounded-2xl bg-surface p-3.5">
      <p className="text-[11px] font-semibold text-muted">Đề xuất chuyển tiền</p>

      <div className="flex items-center gap-2.5">
        {bank ? (
          <BankLogo bank={bank} />
        ) : (
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ background: avatarColor(beneficiary.name) }}
          >
            {initialOf(beneficiary.name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{beneficiary.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {beneficiary.bankName} · <span className="tabular-nums">{beneficiary.accountNumber}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Số tiền">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className={`${fieldClass} font-semibold tabular-nums`}
          />
        </Field>
        <Field label="Danh mục">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Nội dung">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} />
      </Field>

      <button
        type="button"
        onClick={confirm}
        disabled={!canSubmit}
        className="mt-1 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-40"
      >
        Chuyển
      </button>
    </div>
  );
}
