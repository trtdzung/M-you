"use client";

import { BookUser, Trash2 } from "lucide-react";
import { useSettingsDemo } from "../../SettingsDemoContext";
import { Notice, Panel } from "../../settings-ui";

/** Settings › Danh bạ tin cậy. Removing someone raises security, so it applies at once. */
export function TrustedContactsScreen() {
  const demo = useSettingsDemo();
  const contacts = demo.trustedContacts;

  return <>
    <Notice>Chuyển tiền cho người trong danh bạ tin cậy sẽ không bị M-You giữ lại hay cảnh báo. Nếu có tài khoản giả danh họ (trùng tên, khác số tài khoản), M-You sẽ nhận ra.</Notice>
    {contacts.length === 0
      ? <Panel><div className="py-8 text-center"><BookUser size={40} className="mx-auto mb-3 text-muted" aria-hidden /><p className="font-semibold">Danh bạ tin cậy trống</p></div></Panel>
      : <Panel>{contacts.map(contact => <div key={contact.id} className="settings-row">
        <span className="min-w-0 flex-1"><strong className="block">{contact.name}</strong><span className="mt-1 block text-sm text-muted">{contact.bank} · {contact.account}</span></span>
        <button type="button" aria-label={`Gỡ ${contact.name}`} onClick={() => demo.update({ trustedContacts: contacts.filter(item => item.id !== contact.id) })} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-negative"><Trash2 size={20} aria-hidden /></button>
      </div>)}</Panel>}
    <p className="px-1 text-xs leading-relaxed text-muted">Thêm người vào danh bạ từ màn chuyển tiền thành công.</p>
  </>;
}
