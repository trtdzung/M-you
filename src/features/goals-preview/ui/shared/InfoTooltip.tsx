"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { ring } from "./styles";

export function InfoTooltip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

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
        onClick={() => { setOpen(true); setPinned(true); }}
        onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); setPinned(false); } }}
        className={`flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface/80 ${ring}`}
      >
        <Info size={17} aria-hidden />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute -left-20 top-full z-30 w-64 rounded-2xl border border-border bg-surface p-3 text-sm font-normal leading-5 text-text shadow-card">
          {text}
        </span>
      )}
    </span>
  );
}
