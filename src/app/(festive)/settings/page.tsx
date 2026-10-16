"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, UserCircle2, Info, LogOut, CheckCircle2 } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Card, SectionHeader } from "@/components/primitives";
import { PersonaSwitcher } from "@/components/persona/PersonaSwitcher";
import { getConsent, revokeConsent, type ConsentScope } from "@/lib/consent";

const SCOPE_LABEL: Record<ConsentScope, string> = {
  transactions: "Giao dịch",
  assets: "Tài sản",
  liabilities: "Khoản nợ",
  ai: "Trợ lý AI",
};

/**
 * Hồ sơ & Cài đặt (vào từ account card — quyết định #6). Gom Quyền dữ liệu
 * (xem scope + thu hồi đồng ý — PFM-094), Hồ sơ demo (persona), Về ứng dụng.
 * Thu hồi đồng ý reachable ≤2 chạm. Logic consent giữ nguyên `lib/consent`.
 */
export default function SettingsPage() {
  const router = useRouter();
  const [scopes, setScopes] = useState<ConsentScope[] | null>(null);

  useEffect(() => {
    setScopes(getConsent()?.scopes ?? []);
  }, []);

  function revoke() {
    revokeConsent();
    router.replace("/onboarding");
  }

  return (
    <div>
      <ScreenHeader title="Cài đặt" subtitle="Hồ sơ, quyền dữ liệu & thông tin ứng dụng" />

      <div className="flex flex-col gap-6">
        <section>
          <SectionHeader title="Quyền dữ liệu" subtitle="Dữ liệu bạn đã cho phép sử dụng" />
          <Card className="flex flex-col gap-3">
            {(scopes ?? []).length > 0 ? (
              (scopes ?? []).map((s) => (
                <div key={s} className="flex items-center gap-3">
                  <CheckCircle2 size={18} className="shrink-0 text-positive" />
                  <span className="text-sm font-medium text-text">{SCOPE_LABEL[s]}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">Chưa cấp quyền dữ liệu nào.</p>
            )}
            <div className="mt-1 flex items-start gap-2 rounded-[16px] bg-primary-soft/40 p-3">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-xs text-text">
                Mọi số liệu đều minh bạch nguồn gốc. Trợ lý AI chỉ đọc & giải thích — không chuyển tiền.
              </p>
            </div>
            <button
              type="button"
              onClick={revoke}
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-full border border-negative px-4 py-2.5 text-sm font-semibold text-negative transition-colors hover:bg-negative-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative/40"
            >
              <LogOut size={16} /> Thu hồi đồng ý
            </button>
            <p className="text-[11px] text-muted">
              Thu hồi sẽ xóa đồng ý đã lưu và đưa bạn về màn hình giới thiệu.
            </p>
          </Card>
        </section>

        <section>
          <SectionHeader title="Hồ sơ demo" subtitle="Chọn hồ sơ để xem dữ liệu mẫu" />
          <Card className="flex items-start gap-3">
            <UserCircle2 size={20} className="mt-1 shrink-0 text-primary" />
            <PersonaSwitcher className="flex-1" />
          </Card>
        </section>

        <section>
          <SectionHeader title="Về ứng dụng" />
          <Card className="flex items-start gap-3">
            <Info size={18} className="mt-0.5 shrink-0 text-muted" />
            <p className="text-sm text-muted">
              MSB Financial Copilot — bản mẫu (demo) dùng dữ liệu giả lập. Không kết nối tài
              khoản thật, không thực hiện giao dịch.
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
