"use client";

import Link from "next/link";
import { ArrowRight, LineChart, PiggyBank, ShieldCheck, Wallet } from "lucide-react";
import { Card } from "@/components/primitives";

const VALUE_POINTS = [
  { icon: Wallet, title: "Tôi đang có bao nhiêu?", desc: "Tổng hợp số dư, tài sản và nợ ở một nơi." },
  { icon: LineChart, title: "Tiền đang đi đâu?", desc: "Phân loại chi tiêu, tách cố định và linh hoạt." },
  { icon: PiggyBank, title: "Dòng tiền có ổn không?", desc: "Theo dõi thu – chi và các khoản sắp phải trả." },
  { icon: ShieldCheck, title: "Tôi nên làm gì tiếp?", desc: "Gợi ý dựa trên quy tắc, minh bạch nguồn số liệu." },
];

export default function OnboardingPage() {
  return (
    <div className="flex min-h-full flex-col">
      {/* Hero "2/9" (Quốc khánh) — nền thật crop từ bộ nhận diện, logo trắng đè lên. */}
      <div className="-mx-4 -mt-1 overflow-hidden rounded-b-[28px] bg-[#c81f0e] bg-[url('/brand/hero-2-9.jpg')] bg-cover bg-[position:50%_14%] px-4 pb-20 pt-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/msb-logo-white.png" alt="MSB" className="h-7 w-auto" />
      </div>

      <div className="pt-6">
        <span className="inline-flex items-center rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
          MSB Financial Copilot
        </span>
        <h1 className="mt-4 text-2xl font-bold leading-snug text-text">
          Trợ lý tài chính cá nhân của bạn
        </h1>
        <p className="mt-2 text-sm text-muted">
          Hiểu rõ tài chính của mình qua bốn câu hỏi cốt lõi — với dữ liệu minh bạch,
          không tự động chuyển tiền.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {VALUE_POINTS.map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-primary-soft p-2 text-primary">
              <Icon size={20} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-text">{title}</span>
              <span className="block text-xs text-muted">{desc}</span>
            </span>
          </Card>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <Link
          href="/consent"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-fg shadow-sm transition-opacity hover:opacity-90"
        >
          Bắt đầu
          <ArrowRight size={18} />
        </Link>
        <p className="mt-3 text-center text-xs text-muted">
          Dùng dữ liệu minh hoạ, không kết nối tài khoản thật.
        </p>
      </div>
    </div>
  );
}
