"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

/**
 * Center ＋ FAB of the PFM wallet bottom nav — opens the manual Thêm giao dịch
 * flow. It only RECORDS a self-reported transaction; it never moves money,
 * executes, or confirms a transfer (invariant #3). Phase 05 wires the form; here
 * it deep-links to the transactions panel with `add=1` so the intent is already
 * routable and the FAB is not a dead button.
 */
export function AddTxnFab() {
  const router = useRouter();
  const params = useSearchParams();

  function openAdd() {
    const next = new URLSearchParams(params?.toString());
    next.set("tab", "transactions");
    next.set("add", "1");
    next.delete("dock");
    router.replace(`/pfm?${next.toString()}`, { scroll: false });
  }

  return (
    <button
      type="button"
      onClick={openAdd}
      aria-label="Thêm giao dịch"
      className="brand-gradient pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full text-primary-fg shadow-nav ring-4 ring-white/80 transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
    >
      <Plus size={26} strokeWidth={2.4} />
    </button>
  );
}
