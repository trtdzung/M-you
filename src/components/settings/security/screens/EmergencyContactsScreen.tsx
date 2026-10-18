"use client";

import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { transferNow } from "@/lib/demo-clock";
import { useSettingsDemo, type EmergencyContact } from "../../SettingsDemoContext";
import { Action, Badge, Notice, Panel } from "../../settings-ui";
import { AddEmergencyContactSheet } from "../AddEmergencyContactSheet";
import { ConfirmFaceSheet } from "../ConfirmFaceSheet";
import { DAY_MS, formatPendingAt } from "../pending";

const MAX_CONTACTS = 2;
const maskPhone = (phone: string) => `${phone.slice(0, 3)} ••• ${phone.slice(-4)}`;

function StatusBadge({ contact }: { contact: EmergencyContact }) {
  if (contact.status === "active") return <Badge good>Đang hoạt động</Badge>;
  if (contact.status === "removing" && contact.removeAt !== undefined) return <Badge tone="neutral">Sẽ gỡ lúc {formatPendingAt(contact.removeAt)}</Badge>;
  return <Badge>Chờ đồng ý</Badge>;
}

/** Settings › Người thân khẩn cấp. Removing an active contact needs a face check and waits 24h. */
export function EmergencyContactsScreen() {
  const demo = useSettingsDemo();
  const contacts = demo.emergencyContacts;
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<EmergencyContact | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const patch = (id: string, change: Partial<EmergencyContact>) => demo.update({ emergencyContacts: contacts.map(contact => contact.id === id ? { ...contact, ...change } : contact) });
  const drop = (id: string) => demo.update({ emergencyContacts: contacts.filter(contact => contact.id !== id) });

  return <>
    <Notice>Người thân nhận thông báo khi bạn khóa tài khoản khẩn cấp hoặc khi giao dịch bị giữ. Họ <strong>không</strong> xem được số dư hay giao dịch của bạn.</Notice>
    {message && <p role="status" className="rounded-[20px] bg-positive-soft p-4 text-sm leading-relaxed text-positive">{message}</p>}
    {contacts.length === 0 ? <Panel><div className="py-8 text-center"><Users size={40} className="mx-auto mb-3 text-muted" aria-hidden /><p className="font-semibold">Chưa có người thân khẩn cấp</p><p className="mt-1 text-sm leading-relaxed text-muted">Thêm tối đa 2 người để họ được báo khi bạn gặp sự cố.</p></div></Panel>
      : <Panel>{contacts.map(contact => <div key={contact.id} className="settings-row"><div className="w-full">
        <div className="flex items-start gap-3"><span className="min-w-0 flex-1"><strong className="block">{contact.name}</strong><span className="mt-1 block text-sm text-muted">{contact.relation} · {maskPhone(contact.phone)}</span></span><StatusBadge contact={contact} /></div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {contact.status === "pending" && <button type="button" className="text-muted underline underline-offset-4" onClick={() => patch(contact.id, { status: "active" })}>Giả lập: người thân đã đồng ý</button>}
          {contact.status === "active" && <button type="button" className="font-semibold text-negative" onClick={() => setRemoving(contact)}>Gỡ</button>}
          {contact.status === "removing" && <>
            <button type="button" className="font-semibold text-primary" onClick={() => patch(contact.id, { status: "active", removeAt: undefined })}>Hủy gỡ</button>
            <button type="button" className="text-muted underline underline-offset-4" onClick={() => drop(contact.id)}>Giả lập: đã qua 24 giờ</button>
          </>}
        </div>
      </div></div>)}</Panel>}
    {contacts.length < MAX_CONTACTS && <Action onClick={() => { setMessage(null); setAdding(true); }}><span className="inline-flex items-center gap-2"><UserPlus size={20} aria-hidden />Thêm người thân</span></Action>}
    <AddEmergencyContactSheet open={adding} onClose={() => setAdding(false)} onAdd={contact => {
      demo.update({ emergencyContacts: [...contacts, { ...contact, id: crypto.randomUUID(), status: "pending" }] });
      setAdding(false);
      setMessage("Đã gửi lời mời. Người thân cần đồng ý trong app MSB hoặc qua SMS.");
    }} />
    <ConfirmFaceSheet open={removing !== null} title={`Gỡ ${removing?.name ?? "người thân"}?`} message="Gỡ người thân khẩn cấp cần chờ 24 giờ. Người thân vẫn được báo cho tới lúc đó." onConfirm={() => { if (removing) patch(removing.id, { status: "removing", removeAt: transferNow().getTime() + DAY_MS }); setRemoving(null); }} onClose={() => setRemoving(null)} />
  </>;
}
