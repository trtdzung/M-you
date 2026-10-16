"use client";

import { Check } from "lucide-react";
import { CATEGORY_BY_ID, type JarRole } from "@/domain/models";
import { isDuplicateLabel } from "@/domain/engine";
import { useJarConfig } from "@/state/jars";
import { Sheet } from "@/components/primitives";
import { categoryColor, JAR_COLOR_OPTIONS, jarAccent } from "@/lib/category-colors";
import { cn } from "@/lib/cn";
import { JAR_ICON_KEYS, jarIcon } from "./jar-visuals";
import { HuLimitField } from "./HuLimitField";
import { HuDeleteSection } from "./HuDeleteSection";
import { JarMutationErrorNotice } from "./JarMutationErrorNotice";

/**
 * Trình sửa một hũ (mô hình ngân sách): tên, hạn mức/tháng (`HuLimitField`), vai
 * trò, màu, icon, danh mục trong hũ (chuyển sang hũ khác — exactly-one), và xoá
 * hũ (`HuDeleteSection`). Mọi thay đổi ghi qua `useJarConfig` — state (theo phản
 * hồi server) là nguồn sự thật; lần ghi bị từ chối hiện ở `JarMutationErrorNotice`.
 */
/**
 * Donor-waterfall roles (plan 260918-1120): the order auto-fund drains jars when
 * another is short — `buffer` → `spending` → `essential`, with `goal` PROTECTED
 * (never auto-raided; a goal-only shortfall needs explicit confirm). VN labels.
 */
const ROLE_OPTIONS: { value: JarRole; label: string; hint: string }[] = [
  { value: "buffer", label: "Dự phòng", hint: "Ưu tiên rót khi hũ khác thiếu" },
  { value: "spending", label: "Tùy ý", hint: "Chi tiêu linh hoạt" },
  { value: "essential", label: "Thiết yếu", hint: "Chỉ rót khi bất đắc dĩ" },
  { value: "goal", label: "Mục tiêu", hint: "Được bảo vệ — cần xác nhận mới rút" },
];

export function HuEditorSheet({ jarId, onClose }: { jarId: string; onClose: () => void }) {
  const { config, updateJar, assignCategory } = useJarConfig();
  const jar = config.jars.find((j) => j.id === jarId);

  if (!jar) return null;

  const otherJars = config.jars.filter((j) => j.id !== jarId);
  const dup = isDuplicateLabel(jar.label, config.jars, jarId);

  return (
    <Sheet title="Sửa hũ" description={jar.label} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <JarMutationErrorNotice />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Tên hũ</span>
          <input
            defaultValue={jar.label}
            onBlur={(e) => {
              const el = e.currentTarget;
              const v = el.value.trim();
              if (!v || v === jar.label) return;
              // A refused rename snaps the field back to the stored name (U20).
              void updateJar(jarId, { label: v }).then((ok) => {
                if (!ok) el.value = jar.label;
              });
            }}
            aria-label="Tên hũ"
            className="min-h-11 rounded-row border border-border bg-surface px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
          {dup && <span className="text-xs text-warning">⚠ Trùng tên với hũ khác</span>}
        </label>

        <HuLimitField jar={jar} jars={config.jars} />

        <Field label="Vai trò khi bù hũ">
          <div className="grid grid-cols-2 gap-2">
            {ROLE_OPTIONS.map((opt) => {
              const active = (jar.role ?? "spending") === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateJar(jarId, { role: opt.value })}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-row border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    active ? "border-primary bg-primary/10" : "border-border bg-surface",
                  )}
                >
                  <span className="text-sm font-medium text-text">{opt.label}</span>
                  <span className="text-[11px] text-muted">{opt.hint}</span>
                </button>
              );
            })}
          </div>
        </Field>

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
                {jarAccent(jar) === c && <Check size={16} className="text-primary-fg" aria-hidden />}
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
                    "flex h-10 w-10 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
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
                      className="min-h-9 rounded-sm border border-border bg-surface px-2 text-xs text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
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

        <HuDeleteSection jar={jar} jars={config.jars} onDeleted={onClose} />
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
