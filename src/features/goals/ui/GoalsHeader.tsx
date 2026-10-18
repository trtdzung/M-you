"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { backWithTransition } from "@/lib/view-transition";
import { GOALS_COPY } from "./copy";

/** Back arrow + bold title, same chrome as the Chuyển tiền header. */
export function GoalsHeader({ title = GOALS_COPY.title, onBack }: { title?: string; onBack?: () => void }) {
  const router = useRouter();
  return (
    <header className="goals-header flex items-center gap-3 py-3">
      <button
        type="button"
        onClick={onBack ?? (() => backWithTransition(() => router.back()))}
        aria-label="Quay lại"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text transition-colors hover:bg-surface/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <ArrowLeft size={22} strokeWidth={2} />
      </button>
      <h1 className="text-[22px] leading-7 font-bold text-text">{title}</h1>
    </header>
  );
}
