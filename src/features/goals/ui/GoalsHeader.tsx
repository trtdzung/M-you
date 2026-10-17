"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { GOALS_COPY } from "./copy";

/** Back arrow + bold title, same chrome as the Chuyển tiền header. */
export function GoalsHeader({ title = GOALS_COPY.title }: { title?: string }) {
  const router = useRouter();
  return (
    <header className="flex items-center gap-2 px-4 pb-2 pt-[calc(var(--safe-area-top)+0.25rem)]">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Quay lại"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text transition-colors hover:bg-surface/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <ArrowLeft size={22} strokeWidth={2} />
      </button>
      <h1 className="text-[24px] leading-8 font-bold tracking-tight text-text">{title}</h1>
    </header>
  );
}
