"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CircleCheck, Phone } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { useShallow } from "zustand/react/shallow";
import { useSecurityStore } from "@/state/security/store";
import { effectiveContacts } from "@/state/security/selectors";
import { usePersona } from "@/providers/context";
import { loadEmergencyBrief, requestEmergency } from "@/components/security/emergency";
import { SCENARIO_COPY } from "@/lib/security/scenario-copy";
import { SourceLine } from "@/components/security/InterventionCopy";
import { Notice } from "../../settings-ui";
import { ConfirmFaceSheet } from "../ConfirmFaceSheet";
import { PendingOffNotice } from "../PendingOffNotice";

const timeLabel = (at: number) => new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
const redButton = "shield-danger-primary flex items-center justify-center gap-2";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return <section className="settings-panel flex gap-3 p-4">
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-negative-soft font-bold text-negative">{n}</span>
    <div className="min-w-0 flex-1"><h2 className="font-bold">{title}</h2><div className="mt-2 text-sm leading-relaxed">{children}</div></div>
  </section>;
}

/** Settings › Khẩn cấp (SC1): lock, flag transactions, call the priority hotline. */
export function SosScreen() {
  const security = useSecurityStore(useShallow(state => ({ accountLocked: state.accountLocked, accountLockedAt: state.accountLockedAt, emergencyContacts: state.emergencyContacts, unlockAt: state.pendingOff.accountLock })));
  const { requestOff, cancelOff, applyOff } = useSecurityStore.getState();
  const { persona } = usePersona();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  useEffect(() => { void requestEmergency(persona.cif, "enter").then(ok => setError(!ok)); }, [persona.cif]);
  useEffect(() => {
    if (!security.accountLocked) { setBrief(null); return; }
    let live = true;
    void loadEmergencyBrief(persona.cif).then(summary => { if (live) setBrief(summary); });
    return () => { live = false; };
  }, [persona.cif, security.accountLocked, security.accountLockedAt]);
  async function confirmLock() {
    setBusy(true);
    const state = await requestEmergency(persona.cif, "lock");
    setBusy(false);
    if (!state || state === true) return setError(true);
    useSecurityStore.setState(state);
    setError(false);
    setLocking(false);
  }
  const [locking, setLocking] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  // A contact being removed stays in effect until the 24h wait ends.
  const contacts = effectiveContacts(security);

  return <>
    <div>
      <p className="text-xs font-bold tracking-wide text-negative">CHẾ ĐỘ KHẨN CẤP</p>
      <h2 className="mt-1 text-2xl font-bold">Bình tĩnh, M-You ở đây</h2>
      <p className="mt-2 text-base leading-relaxed text-muted">Khóa tạm để bảo vệ tài khoản, kiểm tra giao dịch và liên hệ hỗ trợ.</p>
      <SourceLine intervention={{ source: "rule" }} />
    </div>
    <Step n={1} title="Khóa tạm tài khoản và thẻ">
      {security.accountLocked ? <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold text-positive"><CircleCheck size={20} aria-hidden />Đã khóa tạm{security.accountLockedAt !== null && ` lúc ${timeLabel(security.accountLockedAt)}`}</span>
        {security.unlockAt === undefined && <button type="button" className="text-sm font-semibold text-primary" onClick={() => setUnlocking(true)}>Mở khóa</button>}
        {security.unlockAt !== undefined && <div className="w-full"><PendingOffNotice action="Mở khóa tài khoản" at={security.unlockAt} onCancel={() => cancelOff("accountLock")} onApply={() => applyOff("accountLock")} /></div>}
      </div> : <button type="button" className={redButton} onClick={() => setLocking(true)}>{SCENARIO_COPY.SC1.chips[0]}</button>}
    </Step>
    <Link href="/settings/case" className="text-sm font-semibold text-primary">{SCENARIO_COPY.SC2.situation}</Link>
    <Step n={2} title="Kiểm tra giao dịch đáng ngờ">
      <p className="text-muted">Mở lịch sử để đối chiếu số tiền, thời gian và người nhận. Ghi lại các thông tin này khi lập hồ sơ tra soát.</p>
      <Link href="/transactions" className="shield-action mt-3 inline-flex items-center">Xem lịch sử giao dịch</Link>
    </Step>
    <Step n={3} title="Nói chuyện với tổng đài viên">
      <p className="text-muted">Bản tóm tắt dưới đây giúp bạn chuẩn bị khi gọi. Việc tạo tóm tắt chưa có nghĩa tổng đài đã tiếp nhận hồ sơ.</p>
      {brief && <p className="mt-3 text-sm leading-relaxed" role="status">{brief}</p>}
      <a href="tel:1900545426" className={`${redButton} mt-3`}><Phone size={18} aria-hidden />{SCENARIO_COPY.SC1.chips[2]}</a>
    </Step>
    {contacts.length > 0
      ? security.accountLocked && <p className="text-sm leading-relaxed" role="status">Người thân khẩn cấp ({contacts.map(contact => contact.name).join(", ")}) đã được báo (giả lập).</p>
      : <Link href="/settings/emergency-contacts" className="text-sm text-primary underline underline-offset-4">Thêm người thân khẩn cấp</Link>}
    <Notice>Bất kỳ ai đề nghị &apos;hỗ trợ lấy lại tiền&apos; có thu phí đều là lừa đảo. MSB chỉ cập nhật hồ sơ trong app.</Notice>
    {error && <Notice>Không thể kết nối engine. Vui lòng thử lại.</Notice>}
    <Sheet open={locking} title="Khóa tạm tài khoản" onClose={() => setLocking(false)}>
      <p className="mb-5 text-sm leading-relaxed">Khóa tạm mọi giao dịch và thẻ? Mở lại cần xác thực khuôn mặt và chờ 24 giờ.</p>
      <button type="button" className={redButton} disabled={busy} onClick={() => void confirmLock()}>{SCENARIO_COPY.SC1.chips[0]}</button>
    </Sheet>
    <ConfirmFaceSheet open={unlocking} title="Mở khóa tài khoản?" message="Mở lại giao dịch và thẻ cần xác thực khuôn mặt và chờ 24 giờ. Tài khoản vẫn khóa tới lúc đó." confirmLabel="Mở khóa" onConfirm={() => {
      void fetch(`/api/security/clock?cif=${encodeURIComponent(persona.cif)}`).then(async response => {
        if (!response.ok) return setError(true);
        const { now } = await response.json();
        requestOff("accountLock", now);
        setUnlocking(false);
      }).catch(() => setError(true));
    }} onClose={() => setUnlocking(false)} />
  </>;
}
