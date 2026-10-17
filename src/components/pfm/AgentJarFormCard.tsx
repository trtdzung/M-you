"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import { markApplied, proposalKey, wasApplied } from "@/lib/agent-applied";
import { usePersona, useProviders } from "@/providers/context";
import { useJarConfig } from "@/state/jars";
import { useCurrentJarFunds } from "@/state/use-current-jar-funds";
import { useCategories } from "@/state/categories";
import type { CreateJarUi, EditJarUi } from "@/lib/agent-api";
import type { JarConfig } from "@/domain/models";
import { AgentJarCategoryPicker, jarCategoryModel } from "./AgentJarCategoryPicker";
import { poolHint, validateAgentJarForm } from "./agent-jar-form-validate";

const fieldClass =
  "w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
      {label}
      {children}
    </label>
  );
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * Renders a `CreateJarUi` / `EditJarUi` (Feature 4) — the agent's proposal to
 * create a jar or change an existing one. The agent never writes: every field is
 * editable here, and "Tạo hũ" / "Cập nhật hũ" is the customer's explicit
 * confirmation, after which `pfm` itself writes through `useJarConfig()`.
 *
 * Two axes (plan 260923): HẠN MỨC is the monthly plan — any value > 0, never
 * checked against the account. SỐ DƯ BAN ĐẦU (create only, prefilled with the
 * agent's required `initial_balance`) is money taken from "Chờ phân bổ": required,
 * 0 allowed, and it must fit the pool; the server re-checks the CASA cap and its
 * 422 is shown in Vietnamese (`mutationError`). An edit changes limit, name and
 * categories only — it never moves balance. No money moves, no OTP (invariant #3).
 *
 * Duplicates are verified AT THE CLICK, against a fresh read of the jar list
 * (`providers.getJarConfig()`): the name may have been taken and a category
 * assigned since (another tab, the settings screen, an earlier proposal). An
 * applied proposal is remembered for the tab, so the card is safe to render from
 * chat history; an unchanged edit reads "Không có thay đổi".
 */
export function AgentJarFormCard({ form, fullWidth = false }: { form: CreateJarUi | EditJarUi; fullWidth?: boolean }) {
  const { persona } = usePersona();
  const providers = useProviders();
  const { config, loaded, addJar, updateJar, mutationError, clearMutationError } = useJarConfig();
  const funds = useCurrentJarFunds();
  const { labels, assignable } = useCategories();

  const isEdit = form.type === "edit_jar";
  const jar = isEdit ? config.jars.find((j) => j.id === form.jar_id) : undefined;
  const key = proposalKey(persona.cif, form);

  const [name, setName] = useState(form.jar_name);
  const [amount, setAmount] = useState(form.allocation_amount);
  const [balanceRaw, setBalanceRaw] = useState(form.type === "create_jar" ? String(form.initial_balance) : "");
  // null = the customer hasn't touched the picker: it shows the agent's list, or (edit
  // without `category_ids`) the jar's current one — resolved lazily because the jar
  // config may still be loading on the first render.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "done">(() => (wasApplied(key) ? "done" : "idle"));
  const [problem, setProblem] = useState<string | null>(null);
  /** This card's last write was refused — only then is the shared `mutationError` ours to show. */
  const [refused, setRefused] = useState(false);

  const wrap = cn("shadow-card flex flex-col gap-2 rounded-2xl bg-surface p-3.5", fullWidth ? "w-full" : "mt-2 w-[85%]");

  if (isEdit && loaded && !jar && status !== "done") {
    return (
      <div className={wrap}>
        <p className="text-xs text-negative">Không tìm thấy hũ này. Hỏi lại M-You để có đề xuất mới.</p>
      </div>
    );
  }

  const currentLimit = jar?.budgetLimit ?? null;
  const cats = jarCategoryModel({ config, jar, isEdit, proposedIds: form.category_ids, picked, assignable, labels });
  const { selected, currentIds } = cats;
  const categoriesChanged = !sameSet(selected, currentIds);
  const changed = !isEdit || name.trim() !== jar?.label || amount !== currentLimit || categoriesChanged;

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    setProblem(null);
    set(v);
  };
  const toggle = edit((id: string) => setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]));

  async function confirm() {
    if (status !== "idle") return;
    setProblem(null);
    setRefused(false);
    clearMutationError();
    setStatus("saving");
    const fail = (message: string) => {
      setStatus("idle");
      setProblem(message);
    };

    let fresh: JarConfig;
    try {
      fresh = await providers.getJarConfig();
    } catch {
      return fail("Không kiểm tra được danh sách hũ hiện tại. Vui lòng thử lại.");
    }
    const freshJar = isEdit ? fresh.jars.find((j) => j.id === jar?.id) : undefined;
    if (isEdit && !freshJar) return fail("Hũ này không còn tồn tại. Hỏi lại M-You để có đề xuất mới.");

    const draft = { isEdit, jarId: jar?.id, name, limit: amount, balanceRaw, selected };
    const found = validateAgentJarForm(fresh, draft, funds, labels);
    if (!found.ok) {
      if (found.drop) setPicked(selected.filter((id) => !found.drop!.includes(id)));
      return fail(found.error);
    }

    // A create always carries the parsed opening balance — never a defaulted 0 (#6).
    if (!isEdit && found.balance === null) return fail("Nhập số dư ban đầu (nhập 0 nếu chưa nạp).");
    const ok = isEdit
      ? await updateJar(freshJar!.id, {
          label: found.label,
          budgetLimit: found.limit,
          ...(categoriesChanged ? { categoryIds: selected } : {}),
        })
      : await addJar(
          { id: `jar-${Date.now()}`, label: found.label, categoryIds: selected, budgetLimit: found.limit },
          found.balance!,
        );
    if (ok) {
      markApplied(key);
      setStatus("done");
    } else {
      setRefused(true); // the server's reason (e.g. over the CASA cap) shows via `mutationError`
      setStatus("idle");
    }
  }

  const done = status === "done";
  const shownError = problem ?? (refused && status === "idle" ? mutationError : null);

  return (
    <div className={wrap}>
      <p className="text-[11px] font-semibold text-muted">{isEdit ? "Đề xuất chỉnh sửa hũ" : "Đề xuất tạo hũ mới"}</p>

      {isEdit && jar && (
        <p className="text-xs text-muted">
          Hiện tại: {jar.label} · hạn mức {currentLimit === null ? "chưa đặt" : formatVnd(currentLimit)}
        </p>
      )}

      <Field label="Tên hũ">
        <input value={name} onChange={(e) => edit(setName)(e.target.value)} disabled={done} className={fieldClass} />
      </Field>
      <Field label="Hạn mức / tháng">
        <input
          type="number"
          value={amount}
          onChange={(e) => edit(setAmount)(Number(e.target.value))}
          disabled={done}
          className={`${fieldClass} font-semibold tabular-nums`}
        />
      </Field>
      {!isEdit && (
        <Field label="Số dư ban đầu">
          <input
            value={balanceRaw}
            onChange={(e) => edit(setBalanceRaw)(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            disabled={done}
            className={`${fieldClass} font-semibold tabular-nums`}
          />
        </Field>
      )}
      {!isEdit && <p className="-mt-1 text-[11px] text-muted">{poolHint(funds)} · Không chuyển tiền, không cần OTP.</p>}

      <AgentJarCategoryPicker isEdit={isEdit} disabled={done} model={cats} onToggle={toggle} />

      <p className="text-xs text-muted">{form.reason}</p>
      {shownError && <p role="alert" className="text-xs text-negative">{shownError}</p>}

      <button
        type="button"
        onClick={confirm}
        disabled={done || status === "saving" || !changed}
        className="mt-1 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-40"
      >
        {done ? (isEdit ? "Đã cập nhật hũ" : "Đã tạo hũ") : status === "saving" ? "Đang lưu…" : !changed ? "Không có thay đổi" : isEdit ? "Cập nhật hũ" : "Tạo hũ"}
      </button>
    </div>
  );
}
