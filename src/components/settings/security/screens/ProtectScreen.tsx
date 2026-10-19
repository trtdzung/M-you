"use client";

import Link from "next/link";
import { useState } from "react";
import { ScrollText, Bot } from "lucide-react";
import { transferNow } from "@/lib/demo-clock";
import { useShallow } from "zustand/react/shallow";
import { useSecurityStore } from "@/state/security/store";
import { effectiveContacts } from "@/state/security/selectors";
import { Badge, Panel, Row, Toggle } from "../../settings-ui";
import { ConfirmFaceSheet } from "../ConfirmFaceSheet";
import { PendingOffNotice } from "../PendingOffNotice";
import { isPending } from "../pending";

const DUTIES = [
  ["Nhắc gia cố bảo mật đúng lúc", "Khi lương về, khi có thiết bị lạ đăng nhập, khi nhận tiền từ tài khoản lạ."],
  ["Cảnh báo trước khi tiền đi", "Kiểm tra mỗi lệnh chuyển tiền và hỏi bạn một câu khi có dấu hiệu lừa đảo."],
  ["Đồng hành khi có sự cố", "Khóa khẩn cấp, lập hồ sơ tra soát, nối tổng đài ưu tiên."],
] as const;
const LEVELS = [
  ["bg-positive", "Xanh", "Giao dịch bình thường, không làm phiền bạn"],
  ["bg-warning", "Vàng", "Nhắc nhẹ trong màn xác nhận, bạn bấm tiếp ngay được"],
  ["bg-negative", "Đỏ", "Hỏi một câu, dừng 30–60 giây trước khi bạn tiếp tục"],
] as const;

/** Settings › M-You bảo vệ bạn. Turning off waits 24h; turning on is immediate. */
export function ProtectScreen() {
  const security = useSecurityStore(useShallow(state => ({ aiProtect: state.aiProtect, familyAlerts: state.familyAlerts, securityTips: state.securityTips, emergencyContacts: state.emergencyContacts, pendingOff: state.pendingOff })));
  const { setAiProtect, cancelOff, applyOff, setFamilyAlerts, setSecurityTips } = useSecurityStore.getState();
  const [confirming, setConfirming] = useState(false);
  const offAt = security.pendingOff.aiProtect;
  const pending = isPending(offAt, transferNow().getTime());
  // A contact being removed stays in effect until the 24h wait ends.
  const hasActiveContact = effectiveContacts(security).length > 0;
  const on = security.aiProtect;

  const toggle = () => {
    if (on) setConfirming(true);
    else setAiProtect(true);
  };
  const requestOff = () => {
    setAiProtect(false, transferNow().getTime());
    setConfirming(false);
  };

  return <>
    <Panel><div className="settings-row"><span className="flex-1"><strong>Bật bảo vệ bằng AI</strong><span className="mt-1 block text-sm text-muted">M-You là trợ lý AI của MSB. Bật lại có hiệu lực ngay.</span></span><Toggle label="Bật bảo vệ bằng AI" checked={on} onChange={toggle} disabled={pending} /></div></Panel>
    {pending && <PendingOffNotice action="Tắt bảo vệ bằng AI" at={offAt} onCancel={() => cancelOff("aiProtect")} onApply={() => applyOff("aiProtect")} />}
    <div className={on ? undefined : "opacity-50"}>
      <Panel title="Tùy chỉnh">
        <div className="settings-row"><span className="flex-1"><strong>Báo người thân khi có cảnh báo Đỏ</strong>{!hasActiveContact && <Link href="/settings/emergency-contacts" className="mt-1 block text-sm text-primary underline underline-offset-4">Cần thêm người thân khẩn cấp trước</Link>}</span><Toggle label="Báo người thân khi có cảnh báo Đỏ" checked={security.familyAlerts && hasActiveContact} disabled={!on || !hasActiveContact} onChange={() => setFamilyAlerts(!security.familyAlerts)} /></div>
        <div className="settings-row"><span className="flex-1"><strong>Gợi ý bảo mật đúng lúc</strong><span className="mt-1 block text-sm text-muted">Tối đa 1 lần/ngày, 3 lần/tuần</span></span><Toggle label="Gợi ý bảo mật đúng lúc" checked={security.securityTips} disabled={!on} onChange={() => setSecurityTips(!security.securityTips)} /></div>
        <div className="settings-row"><span className="flex-1 font-semibold">Kiểm tra lệnh chuyển tiền</span><Badge good>Luôn bật</Badge></div>
      </Panel>
    </div>
    <details><summary className="shield-details-summary">Cách M-You bảo vệ và các mức cảnh báo</summary><div className="flex flex-col gap-4">    <Panel title="M-You làm gì cho bạn">
      <ol className="space-y-4 py-4">{DUTIES.map(([title, detail], i) => <li key={title} className="flex gap-3"><span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-strong">{i + 1}</span><span><strong className="block">{title}</strong><span className="mt-1 block text-sm leading-relaxed text-muted">{detail}</span></span></li>)}</ol>
    </Panel>
    <Panel title="3 mức cảnh báo">
      <ul className="space-y-3 py-4">{LEVELS.map(([dot, name, detail]) => <li key={name} className="flex items-start gap-3 text-sm leading-relaxed"><span aria-hidden className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${dot}`} /><span><strong>{name}</strong> · {detail}</span></li>)}</ul>
    </Panel>
</div></details>
    <p className="px-1 text-xs leading-relaxed text-muted">M-You là trợ lý AI và không tự quyết định chặn tiền của bạn. Việc tạm dừng giao dịch theo quy định do hệ thống MSB thực hiện. Mọi cảnh báo được ghi lại để bạn xem lại.</p>
    <Panel>
      <Row label="Nhật ký cảnh báo của M-You" icon={ScrollText} href="/settings/alert-log" />
      <Row label="Nhật ký AI" icon={Bot} href="/settings/ai-journal" />
    </Panel>
    <ConfirmFaceSheet open={confirming} title="Tắt bảo vệ bằng AI?" message="Tắt bảo vệ cần chờ 24 giờ để kẻ gian không thể hướng dẫn bạn tắt đi trong lúc đang bị dẫn dắt." onConfirm={requestOff} onClose={() => setConfirming(false)} />
  </>;
}
