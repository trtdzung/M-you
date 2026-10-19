"use client";

import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { ring } from "./styles";

export function InfoTooltip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState({ left: 0, width: 280, arrow: 20 });

  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const position = () => {
      const anchor = root.current;
      const section = anchor?.closest("section");
      if (!anchor || !section) return;
      const rect = anchor.getBoundingClientRect();
      const bounds = section.getBoundingClientRect();
      const scale = rect.width / anchor.offsetWidth || 1;
      const left = (bounds.left - rect.left) / scale;
      setPlacement({ left, width: bounds.width / scale, arrow: -left + anchor.offsetWidth / 2 });
    };
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); setPinned(false); }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <span ref={root} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => { if (!pinned) setOpen(false); }}>
      <button
        type="button"
        aria-label={`Thông tin về ${label}`}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); setPinned(false); }}
        onClick={() => { setOpen(!pinned); setPinned(!pinned); }}
        onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); setPinned(false); } }}
        className={`group flex h-11 w-11 items-center justify-center rounded-full transition-colors ${open ? "text-primary-strong" : "text-muted hover:text-primary-strong"} ${ring}`}
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${open ? "bg-primary-soft" : "group-hover:bg-surface/80"}`}><Info size={17} aria-hidden /></span>
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{ left: placement.left, width: placement.width }}
          className="absolute top-full z-30 rounded-2xl bg-[#1e293b] p-4 text-left text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)]"
        >
          <span aria-hidden style={{ left: placement.arrow - 5 }} className="absolute -top-1 h-2.5 w-2.5 rotate-45 bg-[#1e293b]" />
          <span className="mb-1.5 block text-[13px] font-semibold leading-5">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
          <span className="block text-[13px] font-normal leading-5 text-slate-200">{text}</span>
        </span>
      )}
    </span>
  );
}
