"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CircleCheck, Phone } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { transferNow } from "@/lib/demo-clock";
import { useSettingsDemo } from "../../SettingsDemoContext";
import { Notice } from "../../settings-ui";
import { ConfirmFaceSheet } from "../ConfirmFaceSheet";

const timeLabel = (at: number) => new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
const redButton = "flex w-full items-center justify-center gap-2 rounded-full bg-negative py-3 font-semibold text-white";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return <section className="settings-panel flex gap-3 p-4">
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-negative-soft font-bold text-negative">{n}</span>
    <div className="min-w-0 flex-1"><h2 className="font-bold">{title}</h2><div className="mt-2 text-sm leading-relaxed">{children}</div></div>
  </section>;
}

/** Settings › Khẩn cấp (SC1): lock, flag transactions, call the priority hotline. */
export function SosScreen() {
  const demo = useSettingsDemo();
  const [locking, setLocking] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  // A contact being removed stays in effect until the 24h wait ends.
  const contacts = demo.emergencyContacts.filter(contact => contact.status !== "pending");

  return <>
    <div>
      <p className="text-xs font-bold tracking-wide text-negative">CHẾ ĐỘ KHẨN CẤP</p>
      <h2 className="mt-1 text-2xl font-bold">Bình tĩnh, M-You ở đây</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">Đây không phải lỗi của bạn. Làm ngay 3 bước dưới đây, càng sớm càng có cơ hội giữ lại tiền.</p>
    </div>
    <Step n={1} title="Khóa tạm tài khoản và thẻ">
      {demo.accountLocked ? <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold text-positive"><CircleCheck size={20} aria-hidden />Đã khóa tạm{demo.accountLockedAt !== null && ` lúc ${timeLabel(demo.accountLockedAt)}`}</span>
        <button type="button" className="text-sm font-semibold text-primary" onClick={() => setUnlocking(true)}>Mở khóa</button>
      </div> : <button type="button" className={redButton} onClick={() => setLocking(true)}>Khóa ngay</button>}
    </Step>
    <Step n={2} title="Đánh dấu giao dịch đáng ngờ">
      <p className="text-muted">Chọn các giao dịch bạn không thực hiện hoặc bị dẫn dắt để thực hiện.</p>
      <Link href="/transactions" className="mt-3 inline-block rounded-full border border-primary px-4 py-2 font-semibold text-primary">Xem giao dịch</Link>
    </Step>
    <Step n={3} title="Nói chuyện với tổng đài viên">
      <p className="text-muted">M-You soạn sẵn tóm tắt, bạn không cần kể lại từ đầu.</p>
      <a href="tel:1900545426" className={`${redButton} mt-3`}><Phone size={18} aria-hidden />Gọi tổng đài ưu tiên</a>
    </Step>
    {contacts.length > 0
      ? demo.accountLocked && <p className="text-sm leading-relaxed" role="status">Người thân khẩn cấp ({contacts.map(contact => contact.name).join(", ")}) đã được báo.</p>
      : <Link href="/settings/emergency-contacts" className="text-sm text-primary underline underline-offset-4">Thêm người thân khẩn cấp</Link>}
    <Notice>Bất kỳ ai đề nghị &apos;hỗ trợ lấy lại tiền&apos; có thu phí đều là lừa đảo. MSB chỉ cập nhật hồ sơ trong app.</Notice>
    <Sheet open={locking} title="Khóa tạm tài khoản" onClose={() => setLocking(false)}>
      <p className="mb-5 text-sm leading-relaxed">Khóa tạm mọi giao dịch và thẻ? Bạn mở lại bằng xác thực khuôn mặt.</p>
      <button type="button" className={redButton} onClick={() => { demo.update({ accountLocked: true, accountLockedAt: transferNow().getTime() }); setLocking(false); }}>Khóa ngay</button>
    </Sheet>
    <ConfirmFaceSheet open={unlocking} title="Mở khóa tài khoản?" message="Mở lại giao dịch và thẻ cần xác thực khuôn mặt." confirmLabel="Mở khóa" onConfirm={() => { demo.update({ accountLocked: false, accountLockedAt: null }); setUnlocking(false); }} onClose={() => setUnlocking(false)} />
  </>;
}
