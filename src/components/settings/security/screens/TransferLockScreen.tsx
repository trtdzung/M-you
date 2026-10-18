"use client";

import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { transferNow } from "@/lib/demo-clock";
import { useSettingsDemo } from "../../SettingsDemoContext";
import { Action, Panel, Row } from "../../settings-ui";
import { ConfirmFaceSheet } from "../ConfirmFaceSheet";
import { DAY_MS, formatPendingAt, isPending } from "../pending";

const DURATIONS = [1, 3, 7] as const;

/** Settings › Tự khóa chuyển tiền. Locking applies at once; unlocking early needs a face check. */
export function TransferLockScreen() {
  const demo = useSettingsDemo();
  const [days, setDays] = useState<(typeof DURATIONS)[number]>(1);
  const [confirming, setConfirming] = useState(false);
  // An expired lock counts as off.
  const until = demo.transferLockUntil ?? undefined;
  const locked = isPending(until, transferNow().getTime());

  return <>
    {locked ? <>
      <div className="flex gap-3 rounded-[20px] bg-negative-soft p-4 text-sm leading-relaxed" role="status">
        <Lock size={21} className="shrink-0 text-negative" aria-hidden />
        <p><strong>Đang khóa chuyển tiền ra ngoài đến {formatPendingAt(until)}</strong></p>
      </div>
      <Action onClick={() => setConfirming(true)}>Mở khóa sớm</Action>
    </> : <>
      <Panel><div className="py-5">
        <p className="text-sm leading-relaxed">Khóa mọi lệnh chuyển tiền ra ngoài trong thời gian bạn chọn, ví dụ khi đi du lịch hoặc khi nghi có người theo dõi tài khoản. Chuyển giữa các tài khoản của bạn và thanh toán hóa đơn vẫn dùng được.</p>
        <p className="mt-5 mb-2 text-sm font-medium" id="transfer-lock-duration">Thời hạn khóa</p>
        <div role="radiogroup" aria-labelledby="transfer-lock-duration" className="grid grid-cols-3 gap-2">
          {DURATIONS.map(option => <button key={option} type="button" role="radio" aria-checked={days === option} onClick={() => setDays(option)} className={`rounded-full border py-2.5 text-sm font-semibold ${days === option ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-white"}`}>{option} ngày</button>)}
        </div>
      </div></Panel>
      <Action onClick={() => demo.update({ transferLockUntil: transferNow().getTime() + days * DAY_MS })}>Khóa chuyển tiền</Action>
    </>}
    <Panel title="Giữ giao dịch khi có bất thường">
      <p className="py-4 text-sm leading-relaxed">Khi bạn chuyển cho người nhận mới với số tiền lớn bất thường, hệ thống MSB giữ giao dịch vài phút và M-You, trợ lý AI của MSB, hỏi bạn một câu. Bạn có thể hủy trong lúc chờ.</p>
      <Row label="Bật cùng M-You bảo vệ bạn" icon={ShieldCheck} href="/settings/protect" />
    </Panel>
    <ConfirmFaceSheet open={confirming} title="Mở khóa sớm?" message="Mở khóa sớm cần xác thực khuôn mặt." onConfirm={() => { demo.update({ transferLockUntil: null }); setConfirming(false); }} onClose={() => setConfirming(false)} />
  </>;
}
