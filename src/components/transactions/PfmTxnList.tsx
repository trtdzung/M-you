"use client";

import { useMemo, useState } from "react";
import { EyeOff } from "lucide-react";
import type { Transaction } from "@/domain/models";
import { monthPeriodFromKey, categoryToJarMap, isoInPeriod, jarChipList, KHAC_JAR_ID, VN_UTC_OFFSET_MS } from "@/domain/engine";
import { Card } from "@/components/primitives";
import { Empty, ErrorState, SkeletonScreen, SkeletonRow } from "@/components/states";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { useFinancials } from "@/state/useFinancials";
import { useCategories } from "@/state/categories";
import { useCorrections, useConfirmCategory } from "@/state/corrections";
import { useJarConfig } from "@/state/jars";
import { usePeriod } from "@/state/period";
import { cn } from "@/lib/cn";
import { TxnRow } from "./TxnRow";
import { TxnDetail } from "./TxnDetail";
import { AutoCategorizeBar } from "./AutoCategorizeBar";
import { TxnSuggestionBar } from "./TxnSuggestionBar";

const ALL = "all";

/** VN-calendar (UTC+7) day "YYYY-MM-DD" of an instant — matches the VN month periods. */
function dayKey(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso.slice(0, 10);
  return new Date(t + VN_UTC_OFFSET_MS).toISOString().slice(0, 10);
}
function dayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return key;
  return new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(d);
}

/** Group period txns by day, days + rows newest-first. */
function groupByDay(txns: Transaction[]): { key: string; rows: Transaction[] }[] {
  const byDay = new Map<string, Transaction[]>();
  for (const t of txns) {
    const k = dayKey(t.postedAt);
    const bucket = byDay.get(k);
    if (bucket) bucket.push(t);
    else byDay.set(k, [t]);
  }
  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, rows]) => ({ key, rows: [...rows].sort((x, y) => (x.postedAt < y.postedAt ? 1 : -1)) }));
}

/**
 * Giao dịch panel: danh sách theo ngày, lọc theo hũ, GD chưa phân loại nổi bật.
 * Đọc `allTransactions` (đã áp override danh mục, GIỮ cả GD ẩn) — GD ẩn vẫn hiện
 * (mờ + nhãn "Đã ẩn") nhưng engine đã loại khỏi tính đã-tiêu. Tap → chi tiết
 * (đổi danh mục / ẩn).
 */
export function PfmTxnList() {
  const { loading, error, allTransactions } = useFinancials();
  const { corrections } = useCorrections();
  const confirmCategory = useConfirmCategory();
  const { byId: categoryById, assignable, loaded: categoriesLoaded } = useCategories();
  const { config } = useJarConfig();
  const { month } = usePeriod();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [jar, setJar] = useState<string>(ALL);

  const catToJar = useMemo(() => categoryToJarMap(config), [config]);
  // Chips are measured against the PERSONA'S assignable set: the trailing "Khác"
  // chip must appear when a category the user created is in no hũ yet, and must
  // not appear for a preset that persona has archived.
  const assignableIds = useMemo(() => assignable.map((c) => c.id), [assignable]);
  const chips = useMemo(
    () => [{ jarId: ALL, label: "Tất cả" }, ...jarChipList(config, assignableIds)],
    [config, assignableIds],
  );

  const groups = useMemo(() => {
    const period = monthPeriodFromKey(month);
    const inPeriod = allTransactions.filter((t) => isoInPeriod(t.postedAt, period));
    const filtered =
      jar === ALL ? inPeriod : inPeriod.filter((t) => (catToJar.get(t.categoryId) ?? KHAC_JAR_ID) === jar);
    return groupByDay(filtered);
  }, [allTransactions, month, jar, catToJar]);

  if (error) return <ErrorState />;

  return (
    <div className="flex flex-col gap-5">
      <PeriodPicker />

      <AutoCategorizeBar />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo hũ">
        {chips.map((chip) => {
          const active = chip.jarId === jar;
          return (
            <button
              key={chip.jarId}
              type="button"
              aria-pressed={active}
              onClick={() => setJar(chip.jarId)}
              className={cn(
                "inline-flex min-h-[40px] items-center rounded-full border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                active ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-surface text-muted hover:text-text",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <SkeletonScreen>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </SkeletonScreen>
      ) : groups.length === 0 ? (
        <Empty title="Chưa có giao dịch" description="Kỳ này chưa có giao dịch trong phạm vi đang xem." />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ key, rows }) => (
            <section key={key}>
              <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{dayLabel(key)}</h3>
              <Card className="divide-y divide-border">
                {rows.map((t) => {
                  const correction = corrections[t.id];
                  const hidden = correction?.hidden === true;
                  // "Chưa phân loại" is measured against the persona's STORED
                  // taxonomy: a txn labelled with a category the user created
                  // is labelled, and highlighting it as unlabelled would be a
                  // provenance lie (invariant #5). While the taxonomy is still
                  // loading nothing is flagged — a wrong warning is worse than
                  // a late one.
                  const uncategorized = categoriesLoaded && !categoryById.has(t.categoryId);
                  const pending = correction?.status === "pending" && correction.categoryId !== undefined;
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        hidden && "opacity-55",
                        uncategorized && "rounded-row bg-warning-soft/40",
                      )}
                    >
                      <TxnRow txn={t} onEdit={setSelected} correction={correction} />
                      {pending && (
                        <TxnSuggestionBar
                          correction={correction}
                          onAccept={(categoryId) => confirmCategory(t, categoryId)}
                        />
                      )}
                      {hidden && (
                        <span className="mb-1 ml-1 inline-flex items-center gap-1 text-[11px] text-muted">
                          <EyeOff size={11} aria-hidden /> Đã ẩn khỏi báo cáo
                        </span>
                      )}
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}

      {selected && <TxnDetail txn={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
