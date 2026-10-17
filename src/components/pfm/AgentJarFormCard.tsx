"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import { markApplied, proposalKey, wasApplied } from "@/lib/agent-applied";
import { usePersona } from "@/providers/context";
import { useJarConfig } from "@/state/jars";
import { useFinancials } from "@/state/useFinancials";
import { useCategories } from "@/state/categories";
import { categoryLabel } from "@/domain/models";
import type { CreateJarUi, EditJarUi } from "@/lib/agent-api";

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

/**
 * Renders a `CreateJarUi` / `EditJarUi` (Feature 4) — the agent's proposal to
 * create a jar or change an existing one. The agent never writes: name and limit
 * are editable here, and "Tạo hũ" / "Cập nhật hũ" is the customer's explicit
 * confirmation, after which `pfm` itself writes through `useJarConfig()`. Every
 * check the agent could not make is made against live data before that write —
 * the jar exists, the name is free, and any RAISE of a limit fits the CASA cap
 * (`allocationHeadroom`, the same number the server enforces with a 422).
 *
 * `category_ids` are shown, not editable: a category can live in only one jar, so
 * one that another jar holds is announced as moving here (the server performs
 * the move). The card is safe to render from chat history — an applied proposal
 * is remembered for the tab, and a repeated edit reads "Không có thay đổi".
 */
export function AgentJarFormCard({ form, fullWidth = false }: { form: CreateJarUi | EditJarUi; fullWidth?: boolean }) {
  const { persona } = usePersona();
  const { config, loaded, addJar, updateJar, mutationError, clearMutationError } = useJarConfig();
  const { financials } = useFinancials();
  const { labels } = useCategories();

  const isEdit = form.type === "edit_jar";
  const jar = isEdit ? config.jars.find((j) => j.id === form.jar_id) : undefined;
  const key = proposalKey(persona.cif, form);

  const [name, setName] = useState(form.jar_name);
  const [amount, setAmount] = useState(form.allocation_amount);
  const [status, setStatus] = useState<"idle" | "saving" | "done">(() => (wasApplied(key) ? "done" : "idle"));
  const [problem, setProblem] = useState<string | null>(null);

  const wrap = cn("shadow-card flex flex-col gap-2 rounded-2xl bg-surface p-3.5", fullWidth ? "w-full" : "mt-2 w-[85%]");

  if (isEdit && loaded && !jar && status !== "done") {
    return (
      <div className={wrap}>
        <p className="text-xs text-negative">Không tìm thấy hũ này. Hỏi lại M-Your để có đề xuất mới.</p>
      </div>
    );
  }

  const headroom = financials?.jarEnvelope.pending.amount ?? null;
  const currentLimit = jar?.budgetLimit ?? null;
  const proposedCategories = form.category_ids ?? jar?.categoryIds ?? [];
  const movedFrom = (form.category_ids ?? []).flatMap((id) => {
    const owner = config.jars.find((j) => j.id !== jar?.id && j.categoryIds.includes(id));
    return owner ? [{ id, ownerLabel: owner.label }] : [];
  });

  const changed = !isEdit
    ? true
    : name.trim() !== jar?.label ||
      amount !== currentLimit ||
      (form.category_ids !== undefined &&
        (form.category_ids.length !== jar?.categoryIds.length || form.category_ids.some((id) => !jar?.categoryIds.includes(id))));

  function validate(): string | null {
    const label = name.trim();
    if (!label) return "Nhập tên hũ.";
    if (config.jars.some((j) => j.id !== jar?.id && j.label.trim().toLowerCase() === label.toLowerCase())) {
      return "Đã có hũ trùng tên này.";
    }
    if (!Number.isFinite(amount) || amount <= 0) return "Hạn mức phải lớn hơn 0.";
    const increase = amount - (currentLimit ?? 0);
    if (increase > 0) {
      if (headroom === null) return "Đang tải số dư tài khoản, thử lại sau giây lát.";
      if (headroom === "unknown") return "Chưa có số dư tài khoản để đặt hạn mức.";
      if (increase > headroom) {
        return headroom > 0
          ? `Chỉ còn ${formatVnd(headroom)} để đặt thêm hạn mức.`
          : "Tổng hạn mức đã vượt số dư tài khoản, không đặt thêm được.";
      }
    }
    return null;
  }

  async function confirm() {
    const found = validate();
    if (found) {
      setProblem(found);
      return;
    }
    setProblem(null);
    clearMutationError();
    setStatus("saving");
    const label = name.trim();
    const ok = isEdit
      ? await updateJar(jar!.id, { label, budgetLimit: amount, ...(form.category_ids ? { categoryIds: form.category_ids } : {}) })
      : await addJar({ id: `jar-${Date.now()}`, label, categoryIds: form.category_ids ?? [], budgetLimit: amount });
    if (ok) {
      markApplied(key);
      setStatus("done");
    } else {
      setStatus("idle");
    }
  }

  const done = status === "done";
  const shownError = problem ?? (status === "idle" ? mutationError : null);

  return (
    <div className={wrap}>
      <p className="text-[11px] font-semibold text-muted">{isEdit ? "Đề xuất chỉnh sửa hũ" : "Đề xuất tạo hũ mới"}</p>

      {isEdit && jar && (
        <p className="text-xs text-muted">
          Hiện tại: {jar.label} · hạn mức {currentLimit === null ? "chưa đặt" : formatVnd(currentLimit)}
        </p>
      )}

      <Field label="Tên hũ">
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={done} className={fieldClass} />
      </Field>
      <Field label="Hạn mức / tháng">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          disabled={done}
          className={`${fieldClass} font-semibold tabular-nums`}
        />
      </Field>

      {proposedCategories.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Danh mục</span>
          <div className="flex flex-wrap gap-1">
            {proposedCategories.map((id) => (
              <span key={id} className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-text">
                {categoryLabel(id, labels)}
              </span>
            ))}
          </div>
          {movedFrom.length > 0 && (
            <p className="text-[11px] text-muted">
              {movedFrom.map((m) => `${categoryLabel(m.id, labels)} sẽ chuyển từ hũ ${m.ownerLabel}`).join("; ")}.
            </p>
          )}
        </div>
      )}

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
