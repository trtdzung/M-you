"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, ChevronRight, Tag } from "lucide-react";
import { duplicateLabelIds } from "@/domain/engine";
import { useJarConfig } from "@/state/jars";
import { useCurrentJarFunds } from "@/state/use-current-jar-funds";
import { SectionHeader } from "@/components/primitives";
import { jarAccent } from "@/lib/category-colors";
import { cn } from "@/lib/cn";
import { jarIcon } from "./jar-visuals";
import { HuEditorSheet } from "./HuEditorSheet";
import { HuCreateSheet } from "./HuCreateSheet";
import { HuJarRowFigures } from "./HuJarRowFigures";
import { CategoryManager } from "./CategoryManager";
import { JarMutationErrorNotice } from "./JarMutationErrorNotice";

/**
 * Cài đặt → "Hũ & danh mục": danh sách hũ (icon/màu, tên, số danh mục, hạn mức
 * hoặc "chưa đặt", số dư hoặc "chưa có số dư"), thêm hũ (`HuCreateSheet` — tên +
 * hạn mức + số dư ban đầu, plan 260923), mở trình sửa; + lối vào Quản lý danh mục. Deep-link
 * `?hu=<id>` (từ nút "Đặt hạn mức" ở tab Ngân sách) tự mở đúng hũ. Cảnh báo ⚠ khi
 * hai hũ trùng tên (dedupe — chỉ cảnh báo, không tự gộp). Có trạng thái đang
 * tải / lỗi tải (+ "Thử lại") — lỗi tải KHÔNG hiển thị như "chưa có hũ" (U10).
 */
export function HuCategoryTab() {
  const { config, loaded, error, retry } = useJarConfig();
  // One composition for the whole tab: the rows, the editor and the create sheet
  // all read the same current-month balances + "Chờ phân bổ".
  const funds = useCurrentJarFunds();
  const router = useRouter();
  const params = useSearchParams();
  const huParam = params?.get("hu");
  const [editing, setEditing] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [creating, setCreating] = useState(false);

  const dupes = useMemo(() => duplicateLabelIds(config.jars), [config.jars]);
  const openJar = huParam && config.jars.some((j) => j.id === huParam) ? huParam : editing;

  function closeEditor() {
    setEditing(null);
    if (huParam) {
      const next = new URLSearchParams(params?.toString());
      next.delete("hu");
      router.replace(`/pfm?${next.toString()}`, { scroll: false });
    }
  }

  /** A jar exists only once its create sheet is valid; then its editor opens for categories. */
  function created(id: string) {
    setCreating(false);
    setEditing(id);
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-row bg-surface p-5 text-center">
        <p className="text-sm text-negative">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Thử lại
        </button>
      </div>
    );
  }
  if (!loaded) {
    return (
      <p role="status" className="p-5 text-center text-sm text-muted">
        Đang tải danh sách hũ…
      </p>
    );
  }

  const editorOpen = openJar != null && config.jars.some((j) => j.id === openJar);

  return (
    <div className="flex flex-col gap-5">
      {!editorOpen && !managing && !creating && <JarMutationErrorNotice />}
      <SectionHeader
        title="Hũ & danh mục"
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Plus size={14} aria-hidden /> Thêm hũ
          </button>
        }
      />

      <ul className="flex flex-col gap-2">
        {config.jars.map((jar) => {
          const Icon = jarIcon(jar.icon);
          const accent = jarAccent(jar);
          return (
            <li key={jar.id}>
              <button
                type="button"
                onClick={() => setEditing(jar.id)}
                className="shadow-card flex min-h-16 w-full items-center gap-3 rounded-row bg-surface p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm" style={{ background: `${accent}1a`, color: accent }}>
                  <Icon size={20} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-text">{jar.label}</span>
                    {dupes.has(jar.id) && <span className="shrink-0 text-xs text-warning" aria-label="Trùng tên">⚠</span>}
                  </span>
                  <HuJarRowFigures jar={jar} funds={funds} />
                </span>
                <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => setManaging(true)}
        className={cn(
          "shadow-card flex min-h-14 w-full items-center gap-3 rounded-row bg-surface p-3 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-surface-muted text-muted">
          <Tag size={20} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">Quản lý danh mục</span>
          <span className="block text-xs text-muted">Thêm, đổi tên, ẩn danh mục &amp; xếp hũ</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
      </button>

      {openJar && <HuEditorSheet jarId={openJar} funds={funds} onClose={closeEditor} />}
      {creating && <HuCreateSheet funds={funds} onCreated={created} onClose={() => setCreating(false)} />}
      {managing && <CategoryManager onClose={() => setManaging(false)} />}
    </div>
  );
}
