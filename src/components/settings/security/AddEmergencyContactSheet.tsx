"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { useSecurityStore } from "@/state/security/store";
import { Action } from "../settings-ui";

const RELATIONS = ["Bố/Mẹ", "Vợ/Chồng", "Con", "Anh/Chị/Em", "Khác"] as const;
const VALID_PHONE = /^0\d{9}$/;

/** Form to invite an emergency contact. Adding raises security, so no face check. */
export function AddEmergencyContactSheet({ open, onAdded, onClose }: { open: boolean; onAdded: () => void; onClose: () => void }) {
  const addEmergencyContact = useSecurityStore(state => state.addEmergencyContact);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<string>(RELATIONS[0]);
  const [phone, setPhone] = useState("");
  const valid = name.trim().length > 0 && VALID_PHONE.test(phone);
  const submit = () => {
    addEmergencyContact({ name: name.trim(), relation, phone });
    setName("");
    setRelation(RELATIONS[0]);
    setPhone("");
    onAdded();
  };

  return <Sheet open={open} title="Thêm người thân" onClose={onClose}>
    <label className="mb-4 block"><span className="mb-2 block text-sm font-medium">Họ tên</span><input className="settings-input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="Nhập họ tên" autoComplete="off" /></label>
    <label className="mb-4 block"><span className="mb-2 block text-sm font-medium">Quan hệ</span><select className="settings-input w-full" value={relation} onChange={e => setRelation(e.target.value)}>{RELATIONS.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
    <label className="mb-2 block"><span className="mb-2 block text-sm font-medium">Số điện thoại</span><input className="settings-input w-full" value={phone} inputMode="numeric" maxLength={10} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10 số, bắt đầu bằng 0" autoComplete="off" /></label>
    {phone.length > 0 && !VALID_PHONE.test(phone) && <p role="alert" className="mb-2 text-sm text-negative">Số điện thoại gồm 10 số, bắt đầu bằng 0.</p>}
    <div className="mt-5 pb-2"><Action disabled={!valid} onClick={submit}>Gửi lời mời</Action></div>
  </Sheet>;
}
