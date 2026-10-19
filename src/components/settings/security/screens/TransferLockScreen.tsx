"use client";

import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Lock } from "lucide-react";
import { transferNow } from "@/lib/demo-clock";
import { useSecurityStore } from "@/state/security/store";
import { Action, Panel, Toggle } from "../../settings-ui";
import { formatVnd } from "@/lib/format";
import { HOLD_MINUTES } from "@/lib/security/hold-rules";
import { ConfirmFaceSheet } from "../ConfirmFaceSheet";
import { PendingOffNotice } from "../PendingOffNotice";
import { DAY_MS, formatPendingAt, isPending } from "../pending";

const DURATIONS = [1, 3, 7] as const;

/** Settings › Tự khóa chuyển tiền. Locking applies at once; unlocking early needs a face check and waits 24h. */
export function TransferLockScreen() {
  const transferLockUntil = useSecurityStore(state => state.transferLockUntil);
  const unlockAt = useSecurityStore(state => state.pendingOff.transferLock);
  const { lockTransfers, requestOff, cancelOff, applyOff } = useSecurityStore.getState();
  const [days, setDays] = useState<(typeof DURATIONS)[number]>(1);
  const [confirming, setConfirming] = useState(false);
  // An expired lock counts as off.
  const until = transferLockUntil ?? undefined;
  const now = transferNow().getTime();
  const locked = isPending(until, now);
  // Unlocking early waits 24h, so it only helps while more than 24h remain.
  const canUnlockEarly = locked && until - now > DAY_MS;
  const unlocking = locked && unlockAt !== undefined;

  return <>
    {locked ? <>
      <div className="flex gap-3 rounded-[20px] bg-negative-soft p-4 text-sm leading-relaxed" role="status">
        <Lock size={21} className="shrink-0 text-negative" aria-hidden />
        <p><strong>Đang khóa chuyển tiền ra ngoài đến {formatPendingAt(until)}</strong></p>
      </div>
      {unlocking ? <PendingOffNotice action="Mở khóa chuyển tiền" at={unlockAt} onCancel={() => cancelOff("transferLock")} onApply={() => applyOff("transferLock")} />
        : canUnlockEarly ? <Action onClick={() => setConfirming(true)}>Mở khóa sớm</Action>
        : <p className="px-1 text-sm leading-relaxed text-muted">Khóa còn dưới 24 giờ và sẽ tự hết lúc {formatPendingAt(until)}. Mở khóa sớm cũng cần chờ 24 giờ nên không nhanh hơn.</p>}
    </> : <>
      <Panel><div className="py-5">
        <p className="text-sm leading-relaxed">Khóa mọi lệnh chuyển tiền ra ngoài trong thời gian bạn chọn, ví dụ khi đi du lịch hoặc khi nghi có người theo dõi tài khoản. Chuyển giữa các tài khoản của bạn và thanh toán hóa đơn vẫn dùng được.</p>
        <p className="mt-5 mb-2 text-sm font-medium" id="transfer-lock-duration">Thời hạn khóa</p>
        <div role="radiogroup" aria-labelledby="transfer-lock-duration" className="shield-options">
          {DURATIONS.map(option => <button key={option} type="button" role="radio" aria-checked={days === option} onClick={() => setDays(option)} className={`shield-option border py-2.5 text-sm font-semibold ${days === option ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-white"}`}>{option} ngày</button>)}
        </div>
      </div></Panel>
      <Action onClick={() => lockTransfers(days, transferNow().getTime())}>Khóa chuyển tiền</Action>
    </>}
    <HoldPanel />
    <ConfirmFaceSheet open={confirming} title="Mở khóa sớm?" message="Mở khóa sớm cần xác thực khuôn mặt và chờ 24 giờ để kẻ gian không thể hướng dẫn bạn mở khóa trong lúc đang bị dẫn dắt." onConfirm={() => { requestOff("transferLock", transferNow().getTime()); setConfirming(false); }} onClose={() => setConfirming(false)} />
  </>;
}

const THRESHOLDS = [10_000_000, 20_000_000, 50_000_000] as const;

/**
 * UC 10 (b) "Giữ giao dịch khi có bất thường" (opt-in): a transfer to a new
 * recipient at or above the customer's threshold waits a few minutes and can be
 * cancelled; trusted contacts are never held. Turning it on or lowering the
 * threshold applies now; turning it off waits 24h; raising the threshold is a
 * decrease too, so it means turning off and on again.
 */
function HoldPanel() {
  const hold = useSecurityStore(useShallow(state => ({ on: state.holdEnabled, threshold: state.holdThreshold, offAt: state.pendingOff.hold })));
  const { setHold, lowerHoldThreshold, cancelOff, applyOff } = useSecurityStore.getState();
  const [confirming, setConfirming] = useState(false);
  const pending = isPending(hold.offAt, transferNow().getTime());
  return <>
    <Panel title="Giữ giao dịch khi có bất thường">
      <div className="settings-row">
        <span className="flex-1"><strong>Giữ giao dịch {HOLD_MINUTES} phút</strong><span className="mt-1 block text-sm text-muted">Chuyển cho người nhận mới từ ngưỡng bạn đặt trở lên. Bạn hủy được trong lúc chờ. Người trong danh bạ tin cậy không bị giữ.</span></span>
        <Toggle label="Giữ giao dịch khi có bất thường" checked={hold.on} onChange={() => (hold.on ? setConfirming(true) : setHold(true))} disabled={pending} />
      </div>
      <div className="py-4">
        <p className="mb-2 text-sm font-medium" id="hold-threshold">Ngưỡng giữ</p>
        <div role="radiogroup" aria-labelledby="hold-threshold" className="shield-options">
          {THRESHOLDS.map(value => {
            const raises = hold.on && value > hold.threshold;
            return <button key={value} type="button" role="radio" aria-checked={hold.threshold === value} disabled={raises} onClick={() => (hold.on ? lowerHoldThreshold(value) : useSecurityStore.setState({ holdThreshold: value }))} className={`shield-option border py-2.5 text-sm font-semibold disabled:opacity-40 ${hold.threshold === value ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-white"}`}>{formatVnd(value)}</button>;
          })}
        </div>
        {hold.on && <p className="mt-2 text-xs leading-relaxed text-muted">Hạ ngưỡng có hiệu lực ngay. Nâng ngưỡng là giảm bảo mật: tắt rồi bật lại (chờ 24 giờ).</p>}
      </div>
    </Panel>
    {pending && hold.offAt !== undefined && <PendingOffNotice action="Tắt giữ giao dịch" at={hold.offAt} onCancel={() => cancelOff("hold")} onApply={() => applyOff("hold")} />}
    <ConfirmFaceSheet open={confirming} title="Tắt giữ giao dịch?" message="Tắt cần xác thực khuôn mặt và chờ 24 giờ để kẻ gian không thể hướng dẫn bạn tắt đi trong lúc đang bị dẫn dắt." onConfirm={() => { setHold(false, transferNow().getTime()); setConfirming(false); }} onClose={() => setConfirming(false)} />
  </>;
}
