"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Eye, EyeOff, Flower2 } from "lucide-react";
import { formatVnd } from "@/lib/format";

/**
 * Thẻ tài khoản chính kiểu MSB (khớp ref `1.1`): hàng hạng (avatar + tên hạng +
 * chevron → Cài đặt) · divider · hàng số TK (mask) + số dư (ẩn mặc định + eye).
 * Số/nguồn đến từ provider — không bịa. Chạm hàng hạng = lối vào Hồ sơ & Cài đặt
 * (quyết định #6, consent ≤2 chạm).
 */
export function AccountSummaryCard({
  tier,
  maskedNumber,
  balance,
  freshness,
}: {
  tier: string;
  maskedNumber: string;
  balance: number;
  freshness: string | null;
}) {
  const [hidden, setHidden] = useState(true);

  return (
    <section
      className="shadow-card rounded-[24px] bg-surface p-2"
      aria-label="Tài khoản chính"
      data-freshness={freshness ?? undefined}
    >
      <Link
        href="/settings"
        className="flex items-center gap-3 rounded-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-indigo-100 text-indigo-500">
          <Flower2 size={22} strokeWidth={1.8} />
        </span>
        <span className="flex-1 truncate text-lg font-bold tracking-wide text-primary">
          {tier}
        </span>
        <ChevronRight size={22} className="shrink-0 text-text" />
      </Link>

      <div className="my-2 h-px bg-border" />

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{maskedNumber}</p>
          <p className="text-xl font-bold tracking-wide text-text">
            {hidden ? (
              <span aria-label="Số dư đang ẩn">
                <span aria-hidden="true">*******</span>{" "}
                <span className="text-muted">VND</span>
              </span>
            ) : (
              <span>{formatVnd(balance)}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHidden((v) => !v)}
          aria-label={hidden ? "Hiện số dư" : "Ẩn số dư"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {hidden ? <Eye size={22} /> : <EyeOff size={22} />}
        </button>
      </div>
    </section>
  );
}
