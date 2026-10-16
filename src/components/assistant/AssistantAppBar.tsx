"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Sparkles } from "lucide-react";

/**
 * Thin warm app-bar for `/assistant` (~56px): back arrow → Home, the MSB mark +
 * "Trợ lý MSB" title, and an ⓘ button that toggles the full read-only disclosure
 * (the copy that used to live in a big card on the page). White ink over the cam
 * `brand-gradient` — AA-safe for large/UI text, verified in hero use. Chrome only.
 */
export function AssistantAppBar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative shrink-0">
      <div className="brand-gradient flex items-center gap-2.5 px-3 py-3 text-white">
        <Link
          href="/"
          aria-label="Về Trang chủ"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </Link>

        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Sparkles size={17} strokeWidth={2} className="text-white" />
        </span>
        <h1 className="text-base font-bold tracking-tight">Trợ lý MSB</h1>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Về quyền của trợ lý"
          aria-expanded={open}
          className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <Info size={20} strokeWidth={2} />
        </button>
      </div>

      {open && (
        <div className="shadow-nav absolute inset-x-3 top-full z-30 mt-2 rounded-2xl bg-surface p-3.5 text-sm text-text">
          <p className="leading-relaxed">
            Trợ lý chỉ đọc và giải thích dữ liệu của bạn. Trợ lý
            <span className="font-semibold"> không </span> chuyển tiền hay thực hiện giao dịch.
            Mỗi con số đều kèm nguồn.
          </p>
        </div>
      )}
    </header>
  );
}
