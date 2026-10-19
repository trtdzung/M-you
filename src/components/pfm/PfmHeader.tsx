"use client";

import { useRouter } from "next/navigation";
import { backWithTransition } from "@/lib/view-transition";
import { ArrowLeft } from "lucide-react";

/**
 * PFM sub-app header: back arrow → Home, section title "Tài chính", and a
 * reserved right slot (period selector arrives later). Sits on the calm peach
 * wash with navy ink and no hard border — signals PFM as an entered module.
 */
export function PfmHeader() {
  const router = useRouter();
  function back() {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "goals" && !window.dispatchEvent(new Event("goals-preview:back", { cancelable: true }))) return;
    if (tab === "settings") {
      router.replace("/pfm?tab=budget", { scroll: false });
    } else {
      backWithTransition(() => router.replace("/"));
    }
  }
  return (
    <header className="flex items-center gap-2 pb-5 pt-1">
      <button
        type="button"
        onClick={back}
        aria-label="Quay lại"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text transition-colors hover:bg-surface/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <ArrowLeft size={22} strokeWidth={2} />
      </button>
      <h1 className="text-[22px] font-bold text-text">Tài chính</h1>
      <div className="ml-auto" aria-hidden />
    </header>
  );
}
