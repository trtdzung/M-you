"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, X } from "lucide-react";
import type { Asset, Liability } from "@/domain/models";
import {
  ASSET_TYPE_LABEL,
  LIABILITY_TYPE_LABEL,
  type AssetFields,
  type LiabilityFields,
} from "@/domain/models/asset-liability-input";
import { Money, ProvenanceChip, SectionHeader, Sheet } from "@/components/primitives";
import { AllocationList } from "@/components/wealth/AllocationList";
import { AssetEditor } from "@/components/wealth/AssetEditor";
import { LiabilityEditor } from "@/components/wealth/LiabilityEditor";
import { ErrorState, SkeletonCard, SkeletonScreen, UnknownValue } from "@/components/states";
import { useAssetLiabilities } from "@/state/assets";
import { useFinancials } from "@/state/useFinancials";

type Editing =
  | { kind: "asset"; record?: Asset }
  | { kind: "liability"; record?: Liability }
  | null;

type Deleting =
  | { kind: "asset"; id: string; name: string }
  | { kind: "liability"; id: string; name: string }
  | null;

type Detail =
  | { kind: "asset"; record: Asset }
  | { kind: "liability"; record: Liability }
  | null;

/**
 * Tài sản & Nợ manual manager: create / edit / delete self-reported assets and
 * liabilities. User records live in `AssetLiabilityProvider` (single source of
 * truth, threaded into the engine); seed/bank records are shown read-only. Every
 * row carries its provenance + freshness (#5); a missing valuation renders
 * `UnknownValue`, never 0₫ (#6). No money movement (#3).
 */
export function WealthManager() {
  const { loading, error, financials } = useFinancials();
  const {
    assets,
    liabilities,
    dropped,
    createAsset,
    updateAsset,
    deleteAsset,
    createLiability,
    updateLiability,
    deleteLiability,
    dismissDropNotice,
  } = useAssetLiabilities();

  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Deleting>(null);
  const [detail, setDetail] = useState<Detail>(null);

  // Seed (non-editable) records = engine breakdown minus the user records.
  const userIds = useMemo(
    () => new Set([...assets.map((a) => a.id), ...liabilities.map((l) => l.id)]),
    [assets, liabilities],
  );
  const seed = useMemo(() => {
    const bd = financials?.networth.breakdown ?? [];
    return {
      assets: bd.filter((i) => i.kind === "asset" && !userIds.has(i.id)),
      liabilities: bd.filter((i) => i.kind === "liability" && !userIds.has(i.id)),
    };
  }, [financials, userIds]);

  function confirmDelete() {
    if (!deleting) return;
    if (deleting.kind === "asset") deleteAsset(deleting.id);
    else deleteLiability(deleting.id);
    setDeleting(null);
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pb-24">
      <div className="flex items-center gap-2">
        <Link href="/pfm?tab=overview" aria-label="Về Tổng quan" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <SectionHeader title="Tài sản & Nợ" subtitle="Khai báo thủ công — bạn tự cập nhật" className="mb-0" />
      </div>

      {dropped > 0 && (
        <div role="status" className="flex items-start justify-between gap-2 rounded-xl bg-warning-soft/60 px-3 py-2 text-xs text-text">
          <span>Đã bỏ qua {dropped} bản ghi bị lỗi khi tải. Các bản ghi hợp lệ khác vẫn được giữ nguyên.</span>
          <button type="button" onClick={dismissDropNotice} aria-label="Đóng thông báo" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {error && <ErrorState />}
      {loading && !financials && (
        <SkeletonScreen>
          <SkeletonCard className="h-20" />
          <SkeletonCard className="h-40" />
        </SkeletonScreen>
      )}

      {financials && (
        <>
          <NetWorthStrip financials={financials} />

          <Section
            title="Tài sản"
            addLabel="Thêm tài sản"
            onAdd={() => setEditing({ kind: "asset" })}
            emptyText="Chưa có tài sản tự khai. Thêm để hoàn thiện bức tranh tài sản."
            rows={assets.map((a) => ({
              id: a.id,
              name: a.name,
              typeLabel: ASSET_TYPE_LABEL[a.type],
              amount: a.value,
              source: a.source,
              freshness: a.lastUpdatedAt,
              kind: "asset" as const,
              onOpen: () => setDetail({ kind: "asset", record: a }),
            }))}
          />

          <Section
            title="Khoản nợ"
            addLabel="Thêm khoản nợ"
            onAdd={() => setEditing({ kind: "liability" })}
            emptyText="Chưa có khoản nợ tự khai."
            rows={liabilities.map((l) => ({
              id: l.id,
              name: l.name,
              typeLabel: LIABILITY_TYPE_LABEL[l.type],
              amount: l.outstandingPrincipal,
              source: l.source,
              freshness: l.lastUpdatedAt,
              kind: "liability" as const,
              onOpen: () => setDetail({ kind: "liability", record: l }),
            }))}
          />

          {(seed.assets.length > 0 || seed.liabilities.length > 0) && (
            <section className="flex flex-col gap-2">
              <SectionHeader title="Dữ liệu sẵn có" subtitle="Từ MSB / hồ sơ — không chỉnh sửa tại đây" className="mb-0" />
              {seed.assets.length > 0 && <AllocationList items={seed.assets} />}
              {seed.liabilities.length > 0 && <AllocationList items={seed.liabilities} />}
            </section>
          )}
        </>
      )}

      {editing?.kind === "asset" && (
        <AssetEditor
          asset={editing.record}
          onClose={() => setEditing(null)}
          onSubmit={(fields: AssetFields) =>
            editing.record ? updateAsset(editing.record.id, fields) : createAsset(fields)
          }
        />
      )}
      {editing?.kind === "liability" && (
        <LiabilityEditor
          liability={editing.record}
          onClose={() => setEditing(null)}
          onSubmit={(fields: LiabilityFields) =>
            editing.record ? updateLiability(editing.record.id, fields) : createLiability(fields)
          }
        />
      )}

      {deleting && (
        <DeleteConfirm name={deleting.name} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />
      )}

      {detail && (
        <RecordDetail
          detail={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            if (detail.kind === "asset") setEditing({ kind: "asset", record: detail.record });
            else setEditing({ kind: "liability", record: detail.record });
            setDetail(null);
          }}
          onDelete={() => {
            setDeleting({ kind: detail.kind, id: detail.record.id, name: detail.record.name });
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}

interface Row {
  id: string;
  name: string;
  typeLabel: string;
  amount: number | null;
  source: Asset["source"];
  freshness: string;
  kind: "asset" | "liability";
  onOpen: () => void;
}

function Section({
  title,
  addLabel,
  onAdd,
  emptyText,
  rows,
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  emptyText: string;
  rows: Row[];
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <SectionHeader title={title} className="mb-0" />
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Plus size={14} aria-hidden="true" /> {addLabel}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-surface-muted/40 px-3 py-3 text-xs text-muted">{emptyText}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl bg-surface">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={r.onOpen}
                className="flex min-h-[76px] w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
              >
                <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{r.name}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-xs text-muted">{r.typeLabel}</span>
                  <ProvenanceChip source={r.source} freshness={r.freshness} />
                </div>
                </div>
                {r.amount === null ? (
                  <UnknownValue label className="shrink-0 text-sm" />
                ) : (
                  <Money amount={r.amount} className={r.kind === "liability" ? "shrink-0 text-sm font-semibold text-negative" : "shrink-0 text-sm font-semibold"} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeleteConfirm({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Sheet title={`Xóa “${name}”?`} description="Bản ghi này sẽ bị xóa khỏi hồ sơ tự khai của bạn." onClose={onCancel} closeLabel="Hủy">
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="min-h-12 flex-1 rounded-full border border-border text-sm font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
          Hủy
        </button>
        <button type="button" onClick={onConfirm} className="min-h-12 flex-1 rounded-full bg-negative text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative/50">
          Xóa
        </button>
      </div>
    </Sheet>
  );
}

function RecordDetail({
  detail,
  onClose,
  onEdit,
  onDelete,
}: {
  detail: Exclude<Detail, null>;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isAsset = detail.kind === "asset";
  const amount = isAsset ? detail.record.value : detail.record.outstandingPrincipal;
  const type = isAsset ? ASSET_TYPE_LABEL[detail.record.type] : LIABILITY_TYPE_LABEL[detail.record.type];
  return (
    <Sheet title={detail.record.name} description={`${isAsset ? "Tài sản" : "Khoản nợ"} · ${type}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-surface-muted p-4">
          <p className="text-xs text-muted">Giá trị hiện tại</p>
          <Money amount={amount} className="mt-1 block text-2xl font-bold text-text" />
          <ProvenanceChip source={detail.record.source} freshness={detail.record.lastUpdatedAt} className="mt-2" />
        </div>
        {detail.kind === "liability" && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <DetailCell label="Lãi suất" value={detail.record.interestRate == null ? "Chưa rõ" : `${(detail.record.interestRate * 100).toFixed(2)}%/năm`} />
            <DetailCell label="Trả tối thiểu" value={detail.record.minimumPayment == null ? "Chưa rõ" : "Có thông tin"} />
            <DetailCell label="Ngày đến hạn" value={detail.record.dueDate ?? "Chưa rõ"} />
            <DetailCell label="Kỳ hạn còn lại" value={detail.record.remainingTerm == null ? "Chưa rõ" : `${detail.record.remainingTerm} tháng`} />
          </dl>
        )}
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <button type="button" onClick={onEdit} className="min-h-12 rounded-full bg-primary text-sm font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            Sửa thông tin
          </button>
          <button type="button" onClick={onDelete} className="min-h-12 rounded-full border border-negative/30 text-sm font-semibold text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative/50">
            Xóa bản ghi này
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-medium text-text">{value}</dd>
    </div>
  );
}

function NetWorthStrip({ financials }: { financials: NonNullable<ReturnType<typeof useFinancials>["financials"]> }) {
  const { networth } = financials;
  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface p-3 shadow-card">
      <Cell label="Tài sản" amount={networth.assetsTotal} tone="text-positive" />
      <Cell label="Nợ" amount={networth.liabilitiesTotal} tone="text-negative" />
      <Cell label="Ròng" amount={networth.total} tone={networth.total >= 0 ? "text-text" : "text-negative"} />
    </div>
  );
}

function Cell({ label, amount, tone }: { label: string; amount: number; tone: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted">{label}</span>
      <Money amount={amount} className={`text-sm font-semibold ${tone}`} />
    </div>
  );
}
