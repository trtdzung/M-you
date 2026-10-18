"use client";

import "./shield-ui.css";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { CircleCheck, X } from "lucide-react";
import { Sheet } from "@/components/primitives";
import type { Intervention, RespondAction } from "@/lib/security/intervention-types";
import { HandbookSheet } from "./HandbookSheet";
import { AiSessionNote, InterventionBody } from "./InterventionCopy";
import type { HandbookContext } from "@/lib/security/handbook";
import { useInterventions } from "./useInterventions";
import { useRecovery } from "./useRecovery";
import { SHIELD_TRUST_EVENT } from "./afterTransfer";

// The confirm screen draws its own banner and popup (E10).
const SELF_DRAWN = new Set(["transfer-confirm"]);
const NOTICE_MS = 4_000;

/** A notice lives in the document flow at its own context, never above unrelated controls. */
function InlineNotice({ item, slot, onChoose, onShown }: { item: Intervention; slot: HTMLElement; onChoose: (choice: string) => void; onShown: () => void }) {
  const recovery = useRecovery();
  const [trustChoice, setTrustChoice] = useState<string | null>(null);
  const select = (choice: string) => {
    if (item.scenario === "BT6" && choice === "Lưu vào danh bạ tin cậy") setTrustChoice(choice);
    else onChoose(choice);
  };
  const reported = useRef(false);
  useEffect(() => {
    if (!reported.current) { reported.current = true; onShown(); }
  }, [onShown]);
  const recoveryLabels = ["Đổi mật khẩu", "Kiểm tra thiết bị truy cập", "Bật mã chống giả mạo", "Thêm người thân khẩn cấp"];
  const content = item.scenario === "SC4" ? <details className="shield-recovery" open>
    <summary className="shield-recovery-summary">Hoàn thiện bảo vệ sau sự cố <span>{recovery.steps.filter(Boolean).length}/4 bước</span></summary>
    <ul className="shield-checklist">{recoveryLabels.map((label, index) => <li key={label}><CircleCheck size={18} aria-hidden className={recovery.steps[index] ? "text-positive" : "text-muted"} /><span>{label}</span></li>)}</ul>
    <div className="shield-notice-actions">{item.copy.chips.map(chip => <button key={chip} type="button" onClick={() => onChoose(chip)}>{chip}</button>)}</div>
  </details> : <>
    <button type="button" aria-label="Đóng gợi ý bảo mật" className="shield-notice-close" onClick={() => onChoose("Đóng")}><X size={18} aria-hidden /></button>
    <InterventionBody intervention={item} onChoose={select} extra={item.scenario === "BT4" && <button type="button" className="shield-danger-link" onClick={() => onChoose("Không phải tôi → khóa ngay")}>Không phải tôi → khóa ngay</button>} />
  </>;
  return createPortal(<>
    <section aria-label="Gợi ý bảo mật của M-You" data-testid="shield-tooltip" className="shield-inline-notice">{content}</section>
    <Sheet open={trustChoice !== null} title="Lưu vào danh bạ tin cậy?" onClose={() => setTrustChoice(null)}>
      <p className="mb-5 text-base leading-relaxed">Người nhận của giao dịch này sẽ được áp dụng ngoại lệ với một số cảnh báo và giữ giao dịch theo cài đặt. Hãy xác minh người nhận trước khi lưu. Bạn có thể gỡ trong Trung tâm bảo mật.</p>
      <button type="button" className="login-submit" onClick={() => { if (trustChoice) onChoose(trustChoice); setTrustChoice(null); }}>Xác nhận lưu</button>
      <button type="button" className="shield-action mt-3 w-full" onClick={() => setTrustChoice(null)}>Để sau</button>
    </Sheet>
  </>, slot);
}

function Popup({ item, onChoose, onShown }: { item: Intervention; onChoose: (choice: string) => void; onShown: () => void }) {
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    onShown();
  }, [onShown]);
  return (
    <Sheet open title={item.level === "red" ? "Kiểm tra dấu hiệu rủi ro" : "M-You nhắc bạn"} onClose={() => onChoose("Đóng")}>
      {item.source === "agent" && <AiSessionNote />}
      <InterventionBody
        intervention={item}
        onChoose={onChoose}
        extra={item.level === "red" && (
          <button type="button" className="shield-danger-secondary mt-3" onClick={() => onChoose(item.scenario === "DH6" ? "Không phải tôi → khóa ngay" : "Tôi nghĩ mình bị lừa")}>
            {item.scenario === "DH6" ? "Không phải tôi → khóa ngay" : "Tôi nghĩ mình bị lừa"}
          </button>
        )}
      />
    </Sheet>
  );
}

/**
 * Shows Scam Shield interventions on every signed-in screen (mounted once in
 * AppChrome): tooltips at their anchors, popups, and the full-screen SOS page.
 * The rule engine decides what shows; this only draws it and reports choices.
 */
export function InterventionHost() {
  const { items, respond, shown } = useInterventions();
  const router = useRouter();
  const pathname = usePathname();
  const [notice, setNotice] = useState<string | null>(null);
  const [handbook, setHandbook] = useState<HandbookContext | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const act = (action: RespondAction | null) => {
    if (!action) return;
    if (action.kind === "handbook") setHandbook(action.context);
    else if (action.kind === "navigate") router.push(action.href);
    else if (action.kind === "emergency") router.push("/settings/sos");
    else if (action.kind === "case") router.push("/settings/case");
    else if (action.kind === "callback") setNotice("MSB sẽ gọi lại cho bạn trong ít phút (giả lập).");
    else if (action.kind === "trust") window.dispatchEvent(new Event(SHIELD_TRUST_EVENT));
  };
  const choose = (item: Intervention) => (choice: string) => void respond(item.id, choice).then(act);

  const visible = items.filter(item => !SELF_DRAWN.has(item.target));
  const routedFullscreen = useRef<string | null>(null);
  const fullscreen = visible.find(item => item.surface === "fullscreen");
  useEffect(() => {
    if (!fullscreen || routedFullscreen.current === fullscreen.id) return;
    // Công cụ test stays put so the next card can reset the engine. Leaving it still routes to SOS.
    if (pathname === "/settings/test-tools") return;
    routedFullscreen.current = fullscreen.id;
    shown(fullscreen.id);
    if (pathname !== "/settings/sos" && pathname !== "/settings/case") router.push("/settings/sos");
  }, [fullscreen, pathname, router, shown]);

  const popup = visible.find(item => item.surface === "popup");
  const tooltips = visible.filter(item => item.surface === "tooltip" || item.surface === "banner");
  // One notice at a time, only in a slot owned by this screen. A popup takes visual priority.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick(tick => tick + 1), 500);
    return () => window.clearInterval(timer);
  }, []);
  const findSlot = (item: Intervention) => item.target === "global"
    ? document.getElementById("main-content")
    : document.querySelector<HTMLElement>(`[data-shield-slot="${CSS.escape(item.target)}"]`);
  const current = typeof document === "undefined" || popup ? undefined : tooltips.find(item => findSlot(item));
  const slot = current ? findSlot(current) : null;
  const canvas = typeof document === "undefined" ? null : document.getElementById("device-canvas");

  return (
    <>
      {current && slot && <InlineNotice key={current.id} item={current} slot={slot} onChoose={choose(current)} onShown={() => shown(current.id)} />}
      {popup && <Popup key={popup.id} item={popup} onChoose={choose(popup)} onShown={() => shown(popup.id)} />}
      {handbook && <HandbookSheet context={handbook} onClose={() => setHandbook(null)} />}
      {notice && canvas && createPortal(
        <p role="status" className="absolute inset-x-4 top-14 z-50 rounded-[16px] bg-text p-3 text-center text-sm text-white">{notice}</p>,
        canvas,
      )}
    </>
  );
}
