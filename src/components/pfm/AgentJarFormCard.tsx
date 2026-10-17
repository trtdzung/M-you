"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import { markApplied, proposalKey, wasApplied } from "@/lib/agent-applied";
import { usePersona, useProviders } from "@/providers/context";
import { useJarConfig } from "@/state/jars";
import { useFinancials } from "@/state/useFinancials";
import { useCategories } from "@/state/categories";
import { categoryLabel } from "@/domain/models";
import { KHAC_JAR_ID } from "@/domain/engine";
import type { CreateJarUi, EditJarUi } from "@/lib/agent-api";
import type { JarConfig } from "@/domain/models";

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
 * create a jar or change an existing one. The agent never writes: name, limit AND
 * categories are all editable here, and "Tạo hũ" / "Cập nhật hũ" is the customer's
 * explicit confirmation, after which `pfm` itself writes through `useJarConfig()`.
 * Every check the agent could not make is made against live data before that
 * write — the jar exists, the name is free, and any RAISE of a limit fits the CASA
 * cap (`allocationHeadroom`, the same number the server enforces with a 422).
 *
 * Categories are picked from the persona's assignable set (`useCategories()`),
 * pre-selected with the agent's list. A category can live in only one jar, so one
 * that another jar holds is announced as moving here, and one taken OUT of this
 * jar (edit) is announced as going back to "Khác" — the server performs both. The
 * card is safe to render from chat history: an applied proposal is remembered for
 * the tab, and an unchanged edit reads "Không có thay đổi".
 *
 * Duplicates are verified AT THE CLICK, against a fresh read of the jar list
 * (`providers.getJarConfig()`), not the copy this card rendered with: the name may
 * have been taken and a category assigned since (another tab, the settings screen,
 * an earlier proposal). The server does not enforce unique names, and a create that
 * lists a category another jar holds would silently pull it out of that jar — so
 * neither is left to the server.
 */
export function AgentJarFormCard({ form, fullWidth = false }: { form: CreateJarUi | EditJarUi; fullWidth?: boolean }) {
  const { persona } = usePersona();
  const providers = useProviders();
  const { config, loaded, addJar, updateJar, mutationError, clearMutationError } = useJarConfig();
  const { financials } = useFinancials();
  const { labels, assignable } = useCategories();

  const isEdit = form.type === "edit_jar";
  const jar = isEdit ? config.jars.find((j) => j.id === form.jar_id) : undefined;
  const key = proposalKey(persona.cif, form);

  const [name, setName] = useState(form.jar_name);
  const [amount, setAmount] = useState(form.allocation_amount);
  // null = the customer hasn't touched the picker: it shows the agent's list, or (edit
  // without `category_ids`) the jar's current one — resolved lazily because the jar
  // config may still be loading on the first render.
  const [picked, setPicked] = useState<string[] | null>(null);
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
  const currentIds = jar?.categoryIds ?? [];
  const ownerOf = (id: string) => config.jars.find((j) => j.id !== jar?.id && j.categoryIds.includes(id));
  // A category is "chưa xếp" when no other jar holds it, or only the catch-all "Khác"
  // does — the same rule the settings screens use for where a category sits.
  const isFree = (id: string) => {
    const owner = ownerOf(id);
    return !owner || owner.id === KHAC_JAR_ID;
  };
  // Creating a jar may only take categories that are still unassigned — it never
  // pulls one out of another jar (that is an edit of the jar that RECEIVES it).
  const proposed = form.category_ids ?? currentIds;
  const selected = picked ?? (isEdit ? proposed : proposed.filter(isFree));
  const unavailable = isEdit ? [] : (form.category_ids ?? []).filter((id) => !isFree(id));

  // Edit: every pickable category, plus any selected/current one no longer assignable
  // (archived) so it stays visible and can still be un-picked. Create: only the free ones.
  const options = isEdit
    ? [
        ...assignable.map((c) => ({ id: c.id, label: c.label })),
        ...[...new Set([...selected, ...currentIds])]
          .filter((id) => !assignable.some((c) => c.id === id))
          .map((id) => ({ id, label: categoryLabel(id, labels) })),
      ]
    : assignable.filter((c) => isFree(c.id)).map((c) => ({ id: c.id, label: c.label }));

  const moving = selected.flatMap((id) => {
    const owner = ownerOf(id);
    return owner ? [`${categoryLabel(id, labels)} sẽ chuyển từ hũ ${owner.label}`] : [];
  });
  const released = currentIds.filter((id) => !selected.includes(id));

  const categoriesChanged = !sameSet(selected, currentIds);
  const changed = !isEdit || name.trim() !== jar?.label || amount !== currentLimit || categoriesChanged;

  function toggle(id: string) {
    setProblem(null);
    setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  /** Checks against `cfg` (the FRESH jar list) and `now` (this jar in it, edit only). */
  function validate(cfg: JarConfig, now: { budgetLimit?: number } | undefined): { error: string; drop?: string[] } | null {
    const label = name.trim();
    if (!label) return { error: "Nhập tên hũ." };
    const sameName = cfg.jars.find((j) => j.id !== jar?.id && j.label.trim().toLowerCase() === label.toLowerCase());
    if (sameName) return { error: `Đã có hũ tên "${sameName.label}". Đặt tên khác.` };

    if (!isEdit) {
      // A create must not take a category out of another jar.
      const taken = selected.flatMap((id) => {
        const owner = cfg.jars.find((j) => j.categoryIds.includes(id));
        return owner && owner.id !== KHAC_JAR_ID ? [{ id, owner: owner.label }] : [];
      });
      if (taken.length > 0) {
        return {
          error: `${taken.map((t) => `${categoryLabel(t.id, labels)} đã thuộc hũ ${t.owner}`).join("; ")} nên đã bỏ khỏi lựa chọn. Kiểm tra lại rồi bấm Tạo hũ.`,
          drop: taken.map((t) => t.id),
        };
      }
    }

    if (!Number.isFinite(amount) || amount <= 0) return { error: "Hạn mức phải lớn hơn 0." };
    const increase = amount - (now?.budgetLimit ?? 0);
    if (increase > 0) {
      if (headroom === null) return { error: "Đang tải số dư tài khoản, thử lại sau giây lát." };
      if (headroom === "unknown") return { error: "Chưa có số dư tài khoản để đặt hạn mức." };
      if (increase > headroom) {
        return {
          error:
            headroom > 0
              ? `Chỉ còn ${formatVnd(headroom)} để đặt thêm hạn mức.`
              : "Tổng hạn mức đã vượt số dư tài khoản, không đặt thêm được.",
        };
      }
    }
    return null;
  }

  async function confirm() {
    if (status !== "idle") return;
    setProblem(null);
    clearMutationError();
    setStatus("saving");

    let fresh: JarConfig;
    try {
      fresh = await providers.getJarConfig();
    } catch {
      setStatus("idle");
      setProblem("Không kiểm tra được danh sách hũ hiện tại. Vui lòng thử lại.");
      return;
    }
    const freshJar = isEdit ? fresh.jars.find((j) => j.id === jar?.id) : undefined;
    if (isEdit && !freshJar) {
      setStatus("idle");
      setProblem("Hũ này không còn tồn tại. Hỏi lại M-Your để có đề xuất mới.");
      return;
    }
    const found = validate(fresh, freshJar);
    if (found) {
      if (found.drop) setPicked(selected.filter((id) => !found.drop!.includes(id)));
      setStatus("idle");
      setProblem(found.error);
      return;
    }

    const label = name.trim();
    const ok = isEdit
      ? await updateJar(freshJar!.id, { label, budgetLimit: amount, ...(categoriesChanged ? { categoryIds: selected } : {}) })
      : await addJar({ id: `jar-${Date.now()}`, label, categoryIds: selected, budgetLimit: amount });
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
        <input
          value={name}
          onChange={(e) => {
            setProblem(null);
            setName(e.target.value);
          }}
          disabled={done}
          className={fieldClass}
        />
      </Field>
      <Field label="Hạn mức / tháng">
        <input
          type="number"
          value={amount}
          onChange={(e) => {
            setProblem(null);
            setAmount(Number(e.target.value));
          }}
          disabled={done}
          className={`${fieldClass} font-semibold tabular-nums`}
        />
      </Field>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
          {isEdit ? "Danh mục (bấm để chọn / bỏ)" : "Danh mục chưa xếp hũ (bấm để chọn / bỏ)"}
        </span>
        <div className="flex flex-wrap gap-1">
          {options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                disabled={done}
                onClick={() => toggle(o.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-60",
                  on ? "bg-primary text-primary-fg" : "bg-surface-muted text-text",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {!isEdit && options.length === 0 && (
          <p className="text-[11px] text-muted">Chưa có danh mục nào chưa xếp hũ. Tạo hũ trước, rồi thêm danh mục ở bước sửa hũ.</p>
        )}
        {unavailable.length > 0 && (
          <p className="text-[11px] text-muted">
            {unavailable
              .map((id) => `${categoryLabel(id, labels)} đang thuộc hũ ${ownerOf(id)?.label ?? "khác"}`)
              .join("; ")}{" "}
            nên không chọn được khi tạo hũ mới.
          </p>
        )}
        {moving.length > 0 && <p className="text-[11px] text-muted">{moving.join("; ")}.</p>}
        {isEdit && released.length > 0 && (
          <p className="text-[11px] text-muted">
            {released.map((id) => categoryLabel(id, labels)).join(", ")} bỏ khỏi hũ này sẽ về hũ Khác.
          </p>
        )}
      </div>

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
