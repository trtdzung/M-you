"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePersona } from "@/providers/context";
import type { FraudCase } from "@/lib/security/case-types";
import { SCENARIO_COPY } from "@/lib/security/scenario-copy";

/** Persistent SC3 case card: the incident clock, independent of warning frequency. */
export function CaseBanner() {
  const { persona } = usePersona();
  const [item, setItem] = useState<FraudCase | null>(null);
  useEffect(() => {
    let active = true;
    setItem(null);
    const refresh = async () => {
      try {
        const response = await fetch(`/api/security/cases?cif=${encodeURIComponent(persona.cif)}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { cases: FraudCase[]; now: number };
        const recent = data.cases.find(c => data.now >= c.openedAt && data.now - c.openedAt < 30 * 24 * 60 * 60 * 1000);
        if (active) setItem(recent ?? null);
      } catch { /* retry on the next refresh */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [persona.cif]);
  if (!item) return null;
  return <section className="settings-panel mb-4 p-4" aria-label={SCENARIO_COPY.SC3.situation}>
    <p className="text-base font-semibold">Hồ sơ tra soát</p>
    <p className="mt-1 text-sm text-muted">{item.status === "draft" ? "Đang soạn · Còn thông tin cần bổ sung" : item.status === "submitted" ? "Đã gửi hồ sơ" : "Hồ sơ có cập nhật"}</p>
    <details className="mt-2"><summary className="shield-details-summary">Lưu ý khi chờ hỗ trợ</summary><p className="text-sm leading-relaxed">Cảnh giác với người hứa hỗ trợ lấy lại tiền và yêu cầu trả phí. Kiểm tra cập nhật hồ sơ trong ứng dụng.</p></details>
    <Link href="/settings/case" className="mt-3 inline-block rounded-full border border-primary px-3 py-2 text-sm font-semibold text-primary">{SCENARIO_COPY.SC3.chips[0]}</Link>
  </section>;
}
