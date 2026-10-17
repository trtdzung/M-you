"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { GOALS_COPY } from "./copy";

/** Back arrow + bold title, same chrome as the Chuyển tiền header. */
export function GoalsHeader({ title = GOALS_COPY.title, onBack }: { title?: string; onBack?: () => void }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-border/50 bg-surface/95 px-4 py-3 backdrop-blur">
      <button
        type="button"
        onClick={onBack ?? (() => router.back())}
        aria-label="Quay lại"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text transition-colors hover:bg-surface/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <ArrowLeft size={22} strokeWidth={2} />
      </button>
      <h1 className="text-[22px] leading-7 font-semibold tracking-tight text-text">{title}</h1>
    </header>
  );
}
