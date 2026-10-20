"use client";

import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { useSecurityStore, MAX_EMERGENCY_CONTACTS } from "@/state/security/store";
import type { EmergencyContact } from "@/state/security/types";
import { Action, Badge, Notice, Panel } from "../../settings-ui";
import { AddEmergencyContactSheet } from "../AddEmergencyContactSheet";
import { ConfirmFaceSheet } from "../ConfirmFaceSheet";

const maskPhone = (phone: string) => `${phone.slice(0, 3)} ••• ${phone.slice(-4)}`;


/** Settings › Người thân khẩn cấp. Removing a contact needs a face check and applies at once. */
export function EmergencyContactsScreen() {
  const contacts = useSecurityStore(state => state.emergencyContacts);
  const { removeEmergencyContact } = useSecurityStore.getState();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<EmergencyContact | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return <>
    <Notice>Người thân nhận thông báo khi bạn khóa tài khoản khẩn cấp hoặc khi giao dịch bị giữ. Họ <strong>không</strong> xem được số dư hay giao dịch của bạn.</Notice>
    {message && <p role="status" className="rounded-[20px] bg-positive-soft p-4 text-sm leading-relaxed text-positive">{message}</p>}
    {contacts.length === 0 ? <Panel><div className="py-8 text-center"><Users size={40} className="mx-auto mb-3 text-muted" aria-hidden /><p className="font-semibold">Chưa có người thân khẩn cấp</p><p className="mt-1 text-sm leading-relaxed text-muted">Thêm tối đa 2 người để họ được báo khi bạn gặp sự cố.</p></div></Panel>
      : <Panel>{contacts.map(contact => <div key={contact.id} className="settings-row"><div className="w-full">
        <div className="flex items-start gap-3"><span className="min-w-0 flex-1"><strong className="block">{contact.name}</strong><span className="mt-1 block text-sm text-muted">{contact.relation} · {maskPhone(contact.phone)}</span></span><Badge good>Đang hoạt động</Badge></div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <button type="button" className="font-semibold text-negative" onClick={() => setRemoving(contact)}>Gỡ</button>
        </div>
      </div></div>)}</Panel>}
    {contacts.length < MAX_EMERGENCY_CONTACTS && <Action onClick={() => { setMessage(null); setAdding(true); }}><span className="inline-flex items-center gap-2"><UserPlus size={20} aria-hidden />Thêm người thân</span></Action>}
    <AddEmergencyContactSheet open={adding} onClose={() => setAdding(false)} onAdded={() => {
      setAdding(false);
      setMessage("Đã thêm và gửi thông báo cho người thân qua app MSB hoặc SMS.");
    }} />
    <ConfirmFaceSheet open={removing !== null} title={`Gỡ ${removing?.name ?? "người thân"}?`} message="Người thân sẽ không còn nhận thông báo khi bạn gặp sự cố." onConfirm={() => { if (removing) removeEmergencyContact(removing.id); setRemoving(null); }} onClose={() => setRemoving(null)} />
  </>;
}
