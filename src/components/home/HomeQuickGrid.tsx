"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ScanLine, PiggyBank, CreditCard, Wallet, CalendarDays, Award, LayoutGrid, Landmark, PieChart } from "lucide-react";
import { QuickActions, type QuickAction } from "@/components/common/QuickActions";
import { Sheet } from "@/components/primitives";

export function HomeQuickGrid() {
  const [sheet, setSheet] = useState<string | null>(null);
  const actions: QuickAction[] = [
    { label: "Chuyển tiền", icon: ArrowUpRight, href: "/transfer" },
    { label: "Quét QR", icon: ScanLine, onClick: () => setSheet("Quét QR") },
    { label: "Tiền gửi & đầu tư", icon: PiggyBank, onClick: () => setSheet("Tiền gửi & đầu tư") },
    { label: "Thẻ", icon: CreditCard, onClick: () => setSheet("Thẻ") },
    { label: "Tài khoản lương", icon: Wallet, onClick: () => setSheet("Tài khoản lương") },
    { label: "Rút tiền bằng mã", icon: Landmark, onClick: () => setSheet("Rút tiền bằng mã") },
    { label: "Quản lý lệnh chuyển tiền", icon: CalendarDays, onClick: () => setSheet("Quản lý lệnh chuyển tiền") },
  ];
  const footer: QuickAction[] = [
    { label: "Rewards", icon: Award, onClick: () => setSheet("Rewards") },
    { label: "Xem thêm", icon: LayoutGrid, onClick: () => setSheet("Danh sách dịch vụ") },
  ];
  return <>
    <QuickActions actions={actions} footer={footer} className="home-quick-grid" />
    {sheet && <Sheet title={sheet} onClose={() => setSheet(null)}>
      {sheet === "Danh sách dịch vụ" ? <div className="space-y-4 pb-4"><QuickActions actions={actions} className="!border-0 !bg-transparent !p-0" /><Link href="/pfm" className="flex min-h-12 items-center gap-3 rounded-xl bg-orange-50 px-4 font-semibold text-primary"><PieChart size={23} />Quản lý tài chính PFM</Link><Link href="/settings" className="block py-3 text-sm">Cài đặt và bảo mật</Link></div> : sheet === "Quét QR" ? <div className="pb-5 text-center"><ScanLine size={130} className="mx-auto mb-5 rounded-xl border-2 border-dashed border-orange-300 p-5 text-primary" /><p className="text-sm text-muted">Khung quét QR mô phỏng, chưa sử dụng camera.</p></div> : <div className="space-y-4 pb-4"><p className="text-sm text-muted">{sheet === "Quản lý lệnh chuyển tiền" ? "Bạn chưa có lệnh chuyển tiền đặt lịch trong hồ sơ demo." : `Màn ${sheet} đang được mô phỏng. Bạn có thể xem các tài khoản và sản phẩm trong Tài sản.`}</p><Link href="/accounts" className="login-submit">Xem tài sản</Link></div>}
    </Sheet>}
  </>;
}
