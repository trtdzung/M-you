"use client";

import { useState } from "react";
import { Trash2, Check } from "lucide-react";
import { CATEGORY_BY_ID } from "@/domain/models";
import { isDuplicateLabel } from "@/domain/engine";
import { useJarConfig } from "@/state/jars";
import { Sheet } from "@/components/primitives";
import { validateJarInput } from "@/domain/engine/jar-input";
import { categoryColor, JAR_COLOR_OPTIONS, jarAccent } from "@/lib/category-colors";
import { formatVnd } from "@/lib/format";
import { cn } from "@/lib/cn";
import { JAR_ICON_KEYS, jarIcon } from "./jar-visuals";

/**
 * Trình sửa một hũ (mô hình ngân sách): tên, hạn mức/tháng (để trống = chưa đặt,
 * KHÔNG ép 0 — invariant #6), màu, icon, danh mục trong hũ (chuyển sang hũ khác —
 * exactly-one), và xoá hũ (danh mục dời sang "Khác"). Mọi thay đổi ghi qua
 * `updateJar`/`assignCategory`/`removeJar` — state là nguồn sự thật.
 */
export function HuEditorSheet({ jarId, onClose }: { jarId: string; onClose: () => void }) {
  const { config, updateJar, assignCategory, removeJar } = useJarConfig();
  const jar = config.jars.find((j) => j.id === jarId);
  const [limitDraft, setLimitDraft] = useState(jar?.budgetLimit != null ? String(jar.budgetLimit) : "");
  const [limitError, setLimitError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!jar) return null;

  const otherJars = config.jars.filter((j) => j.id !== jarId);
  const dup = isDuplicateLabel(jar.label, config.jars, jarId);

  function commitLimit() {
    const raw = limitDraft.trim();
    if (raw === "") {
      updateJar(jarId, { budgetLimit: undefined }); // chưa đặt (unknown, not 0)
      setLimitError(null);
      return;
    }
    const res = validateJarInput(raw);
    if (!res.ok || res.value === null) {
      setLimitError(res.error);
      return;
    }
    setLimitError(null);
    updateJar(jarId, { budgetLimit: Math.round(res.value) });
  }

  return (
    <Sheet title="Sửa hũ" description={jar.label} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Tên hũ</span>
          <input
            defaultValue={jar.label}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== jar.label) updateJar(jarId, { label: v });
            }}
            aria-label="Tên hũ"
            className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
          {dup && <span className="text-xs text-warning">⚠ Trùng tên với hũ khác</span>}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Hạn mức/tháng</span>
          <input
            inputMode="numeric"
            value={limitDraft}
            onChange={(e) => setLimitDraft(e.target.value)}
            onBlur={commitLimit}
            placeholder="Chưa đặt"
            aria-label="Hạn mức mỗi tháng"
            className="min-h-11 rounded-xl border border-border bg-surface px-3 text-right text-sm font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
          <span className={cn("text-right text-xs", limitError ? "text-negative" : "text-muted")}>
            {limitError ?? (limitDraft.trim() === "" ? "Để trống = chưa đặt hạn mức" : formatVnd(Number(limitDraft.replace(/[^\d]/g, ""))))}
          </span>
        </label>

        <Field label="Màu">
          <div className="flex flex-wrap gap-2">
            {JAR_COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Màu ${c}`}
                aria-pressed={jarAccent(jar) === c}
                onClick={() => updateJar(jarId, { color: c })}
                className="flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                style={{ background: c }}
              >
                {jarAccent(jar) === c && <Check size={16} className="text-white" aria-hidden />}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Biểu tượng">
          <div className="flex flex-wrap gap-2">
            {JAR_ICON_KEYS.map((key) => {
              const Icon = jarIcon(key);
              const active = (jar.icon ?? "wallet") === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`Icon ${key}`}
                  aria-pressed={active}
                  onClick={() => updateJar(jarId, { icon: key })}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted",
                  )}
                >
                  <Icon size={18} strokeWidth={1.8} />
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={`Danh mục trong hũ (${jar.categoryIds.length})`}>
          {jar.categoryIds.length === 0 ? (
            <p className="text-xs text-muted">Hũ này chưa có danh mục nào.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {jar.categoryIds.map((catId) => (
                <li key={catId} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(catId) }} />
                  <span className="flex-1 truncate text-sm text-text">{CATEGORY_BY_ID[catId]?.label ?? catId}</span>
                  {otherJars.length > 0 && (
                    <select
                      aria-label={`Chuyển ${CATEGORY_BY_ID[catId]?.label ?? catId} sang hũ khác`}
                      value=""
                      onChange={(e) => e.target.value && assignCategory(catId, e.target.value)}
                      className="min-h-9 rounded-lg border border-border bg-surface px-2 text-xs text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <option value="">Chuyển sang…</option>
                      {otherJars.map((j) => (
                        <option key={j.id} value={j.id}>{j.label}</option>
                      ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Field>

        {confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-xl border border-negative/40 bg-negative-soft/40 p-3">
            <p className="text-sm text-text">Xoá hũ này? Danh mục trong hũ sẽ chuyển sang “Khác”.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { removeJar(jarId); onClose(); }}
                className="min-h-10 flex-1 rounded-full bg-negative px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                Xoá hũ
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-10 flex-1 rounded-full border border-border px-3 text-sm font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                Huỷ
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-negative/40 px-3 text-sm font-semibold text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Trash2 size={15} aria-hidden /> Xoá hũ
          </button>
        )}
      </div>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-text">{label}</span>
      {children}
    </div>
  );
}
