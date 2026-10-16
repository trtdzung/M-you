"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card, SectionHeader } from "@/components/primitives";
import { PersonaSwitcher } from "@/components/persona/PersonaSwitcher";
import { setConsent } from "@/lib/consent";

const SCOPES: { title: string; purpose: string }[] = [
  { title: "Giao dịch", purpose: "Tổng hợp thu – chi, phân loại và phát hiện chi tiêu định kỳ." },
  { title: "Tài sản", purpose: "Tính giá trị ròng và bức tranh tài sản của bạn." },
  { title: "Khoản nợ", purpose: "Theo dõi dư nợ và các khoản thanh toán sắp tới." },
  { title: "Trợ lý AI", purpose: "Giải thích số liệu (chỉ đọc), không thực hiện giao dịch." },
];

export default function ConsentPage() {
  const router = useRouter();

  function accept() {
    setConsent();
    router.replace("/");
  }

  return (
    <div className="flex min-h-full flex-col pt-4">
      <SectionHeader title="Quyền truy cập dữ liệu" subtitle="Chúng tôi dùng dữ liệu nào và để làm gì" />

      <div className="flex flex-col gap-3">
        {SCOPES.map((s) => (
          <Card key={s.title} className="flex items-start gap-3">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-positive" />
            <span>
              <span className="block text-sm font-semibold text-text">{s.title}</span>
              <span className="block text-xs text-muted">{s.purpose}</span>
            </span>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <SectionHeader title="Hồ sơ" />
        <Card>
          <PersonaSwitcher />
        </Card>
      </div>

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={accept}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-fg shadow-sm transition-opacity hover:opacity-90"
        >
          Đồng ý &amp; tiếp tục
        </button>
        <p className="mt-3 text-center text-xs text-muted">
          Bạn có thể thu hồi đồng ý bất kỳ lúc nào trong phần Cài đặt.
        </p>
      </div>
    </div>
  );
}
