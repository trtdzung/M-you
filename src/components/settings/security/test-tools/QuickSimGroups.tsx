"use client";

import { useState } from "react";
import { usePersona } from "@/providers/context";
import {
  CHAIN_RECIPIENT, DAY_MS, EMPLOYER, HOUR_MS, STRANGER, creditAccount, creditBurst, getClock, loadAccounts, pickAccount,
  postEvent, putClock, recordChain, screenShareOn, setAccountOpened, settleFd, shiftClock,
} from "./sim";

const chip = "rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40";

/** One-tap copies of the simulation panel, used from the floating sheet. */
export function QuickSimGroups({ onDone }: { onDone: (message: string) => void }) {
  const { persona } = usePersona();
  const [busy, setBusy] = useState(false);
  const cif = persona.cif;

  const run = (task: () => Promise<void>, done: string) => {
    setBusy(true);
    void task().then(() => onDone(done)).catch(err => onDone(err instanceof Error ? err.message : "Không thực hiện được.")).finally(() => setBusy(false));
  };

  const withCurrent = async (task: (accountId: string) => Promise<void>) => {
    const current = pickAccount(await loadAccounts(cif), "current");
    if (!current) throw new Error("Không có tài khoản thanh toán.");
    await task(current.id);
  };

  const settle = async () => {
    const savings = pickAccount(await loadAccounts(cif), "savings");
    if (!savings) throw new Error("Không có sổ tiết kiệm.");
    const amount = Math.min(30_000_000, savings.balance);
    if (!(amount > 0)) throw new Error("Sổ không còn số dư.");
    await settleFd(cif, savings.id, amount);
  };

  const share = async () => {
    const on = await screenShareOn(cif);
    await postEvent(cif, on ? "screen_share_off" : "screen_share_on", on ? {} : { app: "Giả lập" });
  };

  return <>
    <section className="mb-4">
      <h3 className="mb-2 text-sm font-medium text-muted">Tiền vào</h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip} disabled={busy} onClick={() => run(() => withCurrent(id => creditBurst(cif, id)), "Đã ghi 3 × 50.000 từ người lạ.")}>3 × 50.000 từ người lạ</button>
        <button type="button" className={chip} disabled={busy} onClick={() => run(() => withCurrent(id => creditAccount(cif, id, 30_000_000, STRANGER, "transfer", "Chuyen khoan")), "Đã ghi 30 triệu từ người lạ.")}>30 triệu từ người lạ</button>
        <button type="button" className={chip} disabled={busy} onClick={() => run(() => withCurrent(id => creditAccount(cif, id, 120_000_000, EMPLOYER, "salary", "Luong")), "Đã ghi 120 triệu lương.")}>120 triệu lương</button>
      </div>
    </section>
    <section className="mb-4">
      <h3 className="mb-2 text-sm font-medium text-muted">Sự kiện</h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip} disabled={busy} onClick={() => run(settle, "Đã tất toán sổ.")}>Vừa tất toán sổ</button>
        <button type="button" className={chip} disabled={busy} onClick={() => run(() => postEvent(cif, "device_login", { device: "Thiết bị giả lập" }), "Đã ghi đăng nhập thiết bị mới.")}>Đăng nhập thiết bị mới</button>
        <button type="button" className={chip} disabled={busy} onClick={() => run(() => postEvent(cif, "password_changed"), "Đã ghi đổi mật khẩu.")}>Đổi mật khẩu</button>
        <button type="button" className={chip} disabled={busy} onClick={() => run(() => postEvent(cif, "phone_changed"), "Đã ghi đổi SĐT.")}>Đổi SĐT</button>
        <button type="button" className={chip} disabled={busy} onClick={() => run(share, "Đã đổi chia sẻ màn hình.")}>Đang chia sẻ màn hình</button>
        <button type="button" className={chip} disabled={busy} onClick={() => run(() => withCurrent(id => recordChain(cif, id, 2, CHAIN_RECIPIENT)), "Đã chuyển 2 lệnh tăng dần.")}>2 lệnh tăng dần</button>
      </div>
    </section>
    <section className="mb-4">
      <h3 className="mb-2 text-sm font-medium text-muted">Đồng hồ</h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip} disabled={busy} onClick={() => run(() => shiftClock(cif, HOUR_MS).then(() => {}), "Đã tua +1 giờ.")}>+1 giờ</button>
        <button type="button" className={chip} disabled={busy} onClick={() => run(() => shiftClock(cif, DAY_MS).then(() => {}), "Đã tua +1 ngày.")}>+1 ngày</button>
        <button type="button" className={chip} disabled={busy} onClick={() => run(() => shiftClock(cif, 31 * DAY_MS).then(() => {}), "Đã tua +31 ngày.")}>+31 ngày</button>
        <button type="button" className={chip} disabled={busy} onClick={() => run(() => shiftClock(cif, null).then(() => {}), "Đã về hiện tại.")}>Về hiện tại</button>
        <button type="button" className={chip} disabled={busy} onClick={() => run(() => setAccountOpened(cif, 3).then(() => {}), "Ngày mở tài khoản: 3 ngày trước.")}>Khách mới (3 ngày)</button>
        <button type="button" className={chip} disabled={busy} onClick={() => run(async () => {
          const clock = await getClock(cif);
          await putClock(cif, { skipHold: !clock.skipHold });
        }, "Đã đổi bỏ qua thời gian giữ.")}>Bỏ qua thời gian giữ</button>
      </div>
    </section>
  </>;
}
