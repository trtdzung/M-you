"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { CircleCheck, X } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { canvasZoom } from "@/lib/motion";
import type { Intervention, RespondAction } from "@/lib/security/intervention-types";
import { HandbookSheet } from "./HandbookSheet";
import { InterventionBody } from "./InterventionCopy";
import type { HandbookContext } from "@/lib/security/handbook";
import { useInterventions } from "./useInterventions";
import { useRecovery } from "./useRecovery";
import { SCENARIO_COPY } from "@/lib/security/scenario-copy";
import { SHIELD_TRUST_EVENT } from "./afterTransfer";

// The confirm screen draws its own banner and popup (E10).
const SELF_DRAWN = new Set(["transfer-confirm"]);
const NOTICE_MS = 4_000;

type Place = { top: number; left: number; width: number };

/** Where a tooltip goes: under its anchor inside the phone frame, or at the top when there is no anchor. */
function useAnchorPlace(target: string, mayFloat: boolean): Place | null {
  const [place, setPlace] = useState<Place | null>(null);
  useEffect(() => {
    const measure = () => {
      const canvas = document.getElementById("device-canvas");
      if (!canvas) return setPlace(null);
      const zoom = canvasZoom(canvas);
      const frame = canvas.getBoundingClientRect();
      const width = Math.min(320, canvas.offsetWidth - 32);
      const anchor = document.querySelector<HTMLElement>(`[data-shield-anchor="${CSS.escape(target)}"]`);
      // Money-in tips (BT4/BT5) float at the top on any screen until their row is on screen.
      if (!anchor) return setPlace(mayFloat && (target === "global" || target.startsWith("txn:")) ? { top: 56, left: (canvas.offsetWidth - width) / 2, width } : null);
      const rect = anchor.getBoundingClientRect();
      const below = (rect.bottom - frame.top) / zoom + 8;
      const roomBelow = canvas.offsetHeight - below > 160;
      const top = roomBelow ? below : Math.max(56, (rect.top - frame.top) / zoom - 168);
      const center = (rect.left + rect.width / 2 - frame.left) / zoom;
      const left = Math.min(Math.max(16, center - width / 2), canvas.offsetWidth - width - 16);
      setPlace({ top, left, width });
    };
    measure();
    const timer = window.setInterval(measure, 400);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", measure, true);
    };
  }, [target, mayFloat]);
  return place;
}

function Tooltip({ item, mayFloat, onChoose, onShown }: { item: Intervention; mayFloat: boolean; onChoose: (choice: string) => void; onShown: () => void }) {
  const recovery = useRecovery();
  const labels = SCENARIO_COPY.SC4.message.split(": ")[1].split(". ")[0].split(" → ");
  const place = useAnchorPlace(item.target, mayFloat);
  const canvas = typeof document === "undefined" ? null : document.getElementById("device-canvas");
  const reported = useRef(false);
  useEffect(() => {
    if (place && !reported.current) {
      reported.current = true;
      onShown();
    }
  }, [place, onShown]);
  if (!place || !canvas) return null;
  return createPortal(
    <div
      role="dialog"
      aria-label="Gợi ý bảo mật của M-You"
      data-testid="shield-tooltip"
      className="absolute z-40 rounded-[20px] border border-border bg-white p-4 shadow-card"
      style={{ top: place.top, left: place.left, width: place.width }}
    >
      {item.scenario !== "SC4" && <button type="button" aria-label="Đóng" className="absolute right-2 top-2 p-1 text-muted" onClick={() => onChoose("Đóng")}><X size={16} aria-hidden /></button>}
      <InterventionBody
        intervention={item}
        onChoose={onChoose}
        extra={item.scenario === "SC4" ? <ul className="text-xs leading-relaxed">{labels.map((label, index) => <li key={label} className="flex items-center gap-1">{recovery.steps[index] && <CircleCheck size={14} aria-hidden />}{label}</li>)}</ul> : item.scenario === "BT4" && (
          // SC1 trigger: «[Không phải tôi → khóa ngay] (BT4, DH6)».
          <button type="button" className="mt-1 text-left text-xs font-semibold text-negative underline underline-offset-4" onClick={() => onChoose("Không phải tôi → khóa ngay")}>Không phải tôi → khóa ngay</button>
        )}
      />
    </div>,
    canvas,
  );
}

function Popup({ item, onChoose, onShown }: { item: Intervention; onChoose: (choice: string) => void; onShown: () => void }) {
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    onShown();
  }, [onShown]);
  return (
    <Sheet open title={item.level === "red" ? "Khoan đã" : "M-You nhắc bạn"} onClose={() => onChoose("Đóng")}>
      <InterventionBody
        intervention={item}
        onChoose={onChoose}
        extra={item.level === "red" && (
          <button type="button" className="mt-3 w-full rounded-full border-2 border-negative py-3 text-sm font-semibold text-negative" onClick={() => onChoose(item.scenario === "DH6" ? "Không phải tôi → khóa ngay" : "Tôi nghĩ mình bị lừa")}>
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
    routedFullscreen.current = fullscreen.id;
    shown(fullscreen.id);
    if (pathname !== "/settings/sos" && pathname !== "/settings/case") router.push("/settings/sos");
  }, [fullscreen, pathname, router, shown]);

  const popup = visible.find(item => item.surface === "popup");
  const tooltips = visible.filter(item => item.surface === "tooltip" || item.surface === "banner");
  // One tooltip at a time: the newest whose anchor is on this screen, or that may float.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick(tick => tick + 1), 500);
    return () => window.clearInterval(timer);
  }, []);
  const floats = (item: Intervention) => item.target === "global" || item.target.startsWith("txn:");
  const current = typeof document === "undefined" ? undefined
    : tooltips.find(item => floats(item) || document.querySelector(`[data-shield-anchor="${CSS.escape(item.target)}"]`));
  const canvas = typeof document === "undefined" ? null : document.getElementById("device-canvas");

  return (
    <>
      {current && <Tooltip key={current.id} item={current} mayFloat onChoose={choose(current)} onShown={() => shown(current.id)} />}
      {popup && <Popup key={popup.id} item={popup} onChoose={choose(popup)} onShown={() => shown(popup.id)} />}
      {handbook && <HandbookSheet context={handbook} onClose={() => setHandbook(null)} />}
      {notice && canvas && createPortal(
        <p role="status" className="absolute inset-x-4 top-14 z-50 rounded-[16px] bg-text p-3 text-center text-sm text-white">{notice}</p>,
        canvas,
      )}
    </>
  );
}
