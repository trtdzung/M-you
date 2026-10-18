"use client";

import { useState } from "react";
import { MessageSquareLock } from "lucide-react";
import { transferNow } from "@/lib/demo-clock";
import { useSettingsDemo } from "../../SettingsDemoContext";
import { Action, Badge, Notice, Panel } from "../../settings-ui";
import { ConfirmFaceSheet } from "../ConfirmFaceSheet";
import { PendingOffNotice } from "../PendingOffNotice";
import { DAY_MS, isPending, withoutPending } from "../pending";

const VALID_CODE = /^[A-Z0-9]{4,12}$/;

function SmsPreview({ code }: { code: string }) {
  return <div className="rounded-[16px] bg-slate-100 p-4 font-mono text-xs leading-relaxed">
    <p className="mb-2 font-sans text-[11px] font-semibold uppercase text-muted">Xem trước SMS mẫu</p>
    MSB: Ma xac thuc giao dich cua Quy khach … Ma chong gia mao: <strong className="text-primary-strong">{code || "____"}</strong>
  </div>;
}

/** Settings › Mã chống giả mạo. Setting or changing the code needs a face check; turning off waits 24h. */
export function AntiPhishingScreen() {
  const demo = useSettingsDemo();
  const code = demo.antiPhishingCode;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState<"save" | "off" | null>(null);
  const offAt = demo.pendingOff.antiPhishing;
  const pending = isPending(offAt, transferNow().getTime());

  const save = () => {
    demo.update({ antiPhishingCode: draft, pendingOff: withoutPending(demo.pendingOff, "antiPhishing") });
    setEditing(false);
    setDraft("");
    setConfirm(null);
  };
  const requestOff = () => {
    demo.update({ pendingOff: { ...demo.pendingOff, antiPhishing: transferNow().getTime() + DAY_MS } });
    setConfirm(null);
  };

  return <>
    {code === null || editing ? <>
      <Panel><div className="flex gap-3 py-5"><MessageSquareLock size={30} className="shrink-0 text-primary" aria-hidden /><p className="text-sm leading-relaxed">Mã chống giả mạo hiện trong mọi SMS, email, thông báo của MSB. Tin nhắn không có mã của bạn là giả.</p></div></Panel>
      <Panel><div className="py-5">
        <label className="block"><span className="mb-2 block text-sm font-medium">Mã của bạn</span>
          <input className="settings-input w-full font-semibold tracking-widest" value={draft} maxLength={12} autoComplete="off" placeholder="VD: HOAMAI24" onChange={e => setDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} />
        </label>
        <p className="mt-2 mb-4 text-xs leading-relaxed text-muted">Chọn từ dễ nhớ với bạn, không dùng ngày sinh, số tài khoản. Dùng 4–12 chữ in hoa không dấu hoặc số.</p>
        <SmsPreview code={draft} />
      </div></Panel>
      <Action disabled={!VALID_CODE.test(draft)} onClick={() => setConfirm("save")}>{code === null ? "Bật mã" : "Lưu mã mới"}</Action>
      {editing && <button type="button" className="text-sm text-primary" onClick={() => { setEditing(false); setDraft(""); }}>Hủy đổi mã</button>}
    </> : <>
      <Panel><div className="py-5 text-center">
        <div className="mb-3 flex items-center justify-center gap-2"><span className="text-sm text-muted">Mã của bạn</span><Badge good>Đang bật</Badge></div>
        <p className="mb-5 rounded-[16px] border-2 border-dashed border-primary py-4 text-3xl font-bold tracking-[0.2em] text-primary-strong">{code}</p>
        <div className="text-left"><SmsPreview code={code} /></div>
      </div></Panel>
      {pending && <PendingOffNotice action="Tắt mã chống giả mạo" at={offAt} onCancel={() => demo.update({ pendingOff: withoutPending(demo.pendingOff, "antiPhishing") })} onApply={() => demo.update({ antiPhishingCode: null, pendingOff: withoutPending(demo.pendingOff, "antiPhishing") })} />}
      <Action onClick={() => { setDraft(code); setEditing(true); }}>Đổi mã</Action>
      {!pending && <button type="button" className="text-sm font-semibold text-negative" onClick={() => setConfirm("off")}>Tắt mã</button>}
    </>}
    <Notice>MSB không bao giờ hỏi mã OTP, mật khẩu hay mã PIN qua tin nhắn hoặc điện thoại.</Notice>
    <ConfirmFaceSheet open={confirm === "save"} title={code === null ? "Bật mã chống giả mạo?" : "Đổi mã chống giả mạo?"} message="Xác thực để lưu mã chống giả mạo của bạn." onConfirm={save} onClose={() => setConfirm(null)} />
    <ConfirmFaceSheet open={confirm === "off"} title="Tắt mã chống giả mạo?" message="Tắt mã cần chờ 24 giờ để kẻ gian không thể hướng dẫn bạn tắt đi trong lúc đang bị dẫn dắt." onConfirm={requestOff} onClose={() => setConfirm(null)} />
  </>;
}
