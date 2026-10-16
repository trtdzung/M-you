// DEFERRED: unmounted in the 3-tab reformat — engine/tests kept, UI re-enabled
// later. See plans/260909-2254-pfm-3tab-reformat/ and plans/project-backlog.md.
"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import type { Goal } from "@/domain/models";
import type { GoalFields, GoalRecord } from "@/domain/models/goal-input";
import { Money, ProvenanceChip, SectionHeader } from "@/components/primitives";
import { Empty } from "@/components/states";
import { useGoals } from "@/state/goals";
import { useFinancials } from "@/state/useFinancials";
import { GoalEditor } from "./GoalEditor";
import { GoalProjectionCard } from "./GoalProjectionCard";

type Editing = { record?: GoalRecord } | null;
type Deleting = { id: string; name: string } | null;

/**
 * Mục tiêu module: create / edit / delete self-reported goals + a per-goal
 * direct-tap `simulateGoal` what-if. User goals live in `GoalProvider` (single
 * source of truth, threaded into the engine); seed goals show read-only. Every
 * row carries provenance (#5); a projection never mutates a goal (#2/#3).
 */
export function GoalList() {
  const { goals: userGoals, dropped, createGoal, updateGoal, deleteGoal, dismissDropNotice } = useGoals();
  const { financials } = useFinancials();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Deleting>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Seed goals = merged engine goals minus the user records (read-only).
  const userIds = useMemo(() => new Set(userGoals.map((g) => g.id)), [userGoals]);
  const seedGoals = useMemo<Goal[]>(
    () => (financials?.goals ?? []).filter((g) => !userIds.has(g.id)),
    [financials, userIds],
  );

  const selected = userGoals.find((g) => g.id === selectedId) ?? null;

  function confirmDelete() {
    if (!deleting) return;
    deleteGoal(deleting.id);
    if (selectedId === deleting.id) setSelectedId(null);
    setDeleting(null);
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Mục tiêu"
        subtitle="Tạo & theo dõi mục tiêu tiết kiệm"
        className="mb-0"
        action={
          <button
            type="button"
            onClick={() => setEditing({})}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Plus size={14} /> Thêm mục tiêu
          </button>
        }
      />

      {dropped > 0 && (
        <div role="status" className="rounded-xl bg-warning-soft/60 px-3 py-2 text-xs text-text">
          <button type="button" onClick={dismissDropNotice} className="underline">
            Đã bỏ qua {dropped} mục tiêu bị lỗi khi tải (bấm để ẩn)
          </button>
        </div>
      )}

      {userGoals.length === 0 && seedGoals.length === 0 ? (
        <Empty
          title="Chưa có mục tiêu"
          description="Thêm mục tiêu tiết kiệm để theo dõi tiến độ và mô phỏng thời gian đạt."
          icon={<Target size={40} strokeWidth={1.5} />}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl bg-surface">
          {userGoals.map((g) => (
            <GoalRow
              key={g.id}
              goal={g}
              selected={g.id === selectedId}
              onSelect={() => setSelectedId((id) => (id === g.id ? null : g.id))}
              onEdit={() => setEditing({ record: g })}
              onDelete={() => setDeleting({ id: g.id, name: g.name })}
            />
          ))}
          {seedGoals.map((g) => (
            <GoalRow key={g.id} goal={g} readOnly />
          ))}
        </ul>
      )}

      {selected && <GoalProjectionCard goal={selected} />}

      {editing && (
        <GoalEditor
          goal={editing.record}
          onClose={() => setEditing(null)}
          onSubmit={(fields: GoalFields) =>
            editing.record ? updateGoal(editing.record.id, fields) : createGoal(fields)
          }
        />
      )}

      {deleting && (
        <DeleteConfirm name={deleting.name} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />
      )}
    </section>
  );
}

function GoalRow({
  goal,
  selected,
  readOnly,
  onSelect,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  selected?: boolean;
  readOnly?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <button
        type="button"
        onClick={onSelect}
        disabled={readOnly}
        aria-pressed={selected}
        aria-label={readOnly ? goal.name : `Mô phỏng ${goal.name}`}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <p className="truncate text-sm font-medium text-text">{goal.name}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-xs text-muted">
            <Money amount={goal.currentAmount} /> / <Money amount={goal.targetAmount} /> · {pct}%
          </span>
          <ProvenanceChip source={goal.source} />
        </div>
      </button>
      {!readOnly && (
        <>
          <button type="button" onClick={onEdit} aria-label={`Sửa ${goal.name}`} className="shrink-0 rounded-full p-1.5 text-muted hover:text-primary">
            <Pencil size={15} />
          </button>
          <button type="button" onClick={onDelete} aria-label={`Xóa ${goal.name}`} className="shrink-0 rounded-full p-1.5 text-muted hover:text-negative">
            <Trash2 size={15} />
          </button>
        </>
      )}
    </li>
  );
}

function DeleteConfirm({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6" role="alertdialog" aria-modal="true" aria-label="Xác nhận xóa">
      <button type="button" aria-label="Đóng" className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-device-width rounded-2xl bg-surface p-4 shadow-xl">
        <p className="text-sm font-semibold text-text">Xóa “{name}”?</p>
        <p className="mt-1 text-xs text-muted">Mục tiêu này sẽ bị xóa khỏi hồ sơ của bạn.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-full border border-border py-2 text-sm font-medium text-text">
            Hủy
          </button>
          <button type="button" onClick={onConfirm} className="flex-1 rounded-full bg-negative py-2 text-sm font-semibold text-white">
            Xóa
          </button>
        </div>
      </div>
    </div>
  );
}
