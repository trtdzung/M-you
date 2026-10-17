"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Jar } from "@/domain/models";
import { POOL_DONOR_ID } from "@/domain/engine";
import { useJarConfig } from "@/state/jars";
import { useManualTxns } from "@/state/manual-txns";
import { linkedJarIds, rebalanceLegsForJar } from "./jar-rebalance-legs";

const POOL_LABEL = "Chưa phân bổ";

/**
 * "Xoá hũ" with a confirm step. The jar is deleted outright; its categories become "chưa xếp hũ" (in no jar). When the
 * jar has "điều chỉnh hũ" rebalance legs (U8/S8/A47) the confirm says so: the
 * server deletes those legs with the jar, and the linked jars' balance is
 * recalculated. After a successful delete the same legs are dropped from the
 * local manual-txn state (the DELETE is idempotent server-side) so the budget
 * never keeps showing an orphan "Chuyển sang hũ khác" row.
 */
export function HuDeleteSection({ jar, jars, onDeleted }: { jar: Jar; jars: Jar[]; onDeleted: () => void }) {
  const { removeJar } = useJarConfig();
  const { manualTxns, remove } = useManualTxns();
  const [confirming, setConfirming] = useState(false);

  const legs = useMemo(() => rebalanceLegsForJar(manualTxns, jar.id), [manualTxns, jar.id]);
  const linkedLabels = useMemo(
    () =>
      linkedJarIds(legs, jar.id).map((id) =>
        id === POOL_DONOR_ID ? POOL_LABEL : jars.find((j) => j.id === id)?.label ?? id,
      ),
    [legs, jar.id, jars],
  );

  function confirmDelete() {
    const legIds = legs.map((t) => t.id);
    void removeJar(jar.id).then((ok) => {
      if (ok) legIds.forEach((id) => remove(id));
    });
    onDeleted();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-negative/40 px-3 text-sm font-semibold text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <Trash2 size={15} aria-hidden /> Xoá hũ
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-row border border-negative/40 bg-negative-soft/40 p-3">
      <p className="text-sm text-text">Xoá hũ này? Các danh mục trong hũ sẽ thành “Chưa xếp hũ” — chi tiêu cũ vẫn được tính, bạn có thể xếp chúng vào hũ khác sau.</p>
      {legs.length > 0 && (
        <p role="alert" className="text-sm text-negative">
          Hũ này có {legs.length} khoản “Điều chỉnh hũ”. Xoá hũ sẽ xoá luôn các khoản điều chỉnh này
          {linkedLabels.length > 0 ? ` và tính lại các hũ liên quan: ${linkedLabels.join(", ")}.` : "."}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={confirmDelete}
          className="min-h-10 flex-1 rounded-full bg-negative px-3 text-sm font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Xoá hũ
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="min-h-10 flex-1 rounded-full border border-border px-3 text-sm font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Huỷ
        </button>
      </div>
    </div>
  );
}
