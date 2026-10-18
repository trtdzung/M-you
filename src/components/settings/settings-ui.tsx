"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { ChevronRight, Info, type LucideIcon } from "lucide-react";

// Shared building blocks for the Settings demo screens.
export function Panel({ children, title }: { children: ReactNode; title?: ReactNode }) {
  return <section className="settings-panel">{title && <h2 className="settings-panel-title">{title}</h2>}<div className="px-4">{children}</div></section>;
}
export function Row({ label, icon: Icon, href, onClick, detail, trailing }: { label: string; icon?: LucideIcon; href?: string; onClick?: () => void; detail?: string; trailing?: ReactNode }) {
  const content = <>{Icon && <Icon size={27} className="shrink-0 text-text" aria-hidden />}<span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span>{detail && <span className="mt-1 block text-sm font-normal leading-relaxed text-muted">{detail}</span>}</span>{trailing}<ChevronRight size={21} className="shrink-0" aria-hidden /></>;
  return href ? <Link className="settings-row" href={href}>{content}</Link> : <button type="button" className="settings-row" onClick={onClick}>{content}</button>;
}
const BADGE_TONES = { good: "bg-emerald-50 text-emerald-700", warn: "bg-orange-50 text-orange-700", danger: "bg-red-50 text-red-700", neutral: "bg-slate-100 text-slate-700" } as const;
// `tone` wins over the legacy `good` flag; without either the badge is "warn".
export function Badge({ children, good = false, tone }: { children: ReactNode; good?: boolean; tone?: keyof typeof BADGE_TONES }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${BADGE_TONES[tone ?? (good ? "good" : "warn")]}`}>{children}</span>;
}
export function Notice({ children }: { children: ReactNode }) {
  return <div className="flex gap-3 rounded-[20px] border border-blue-400 bg-blue-50 p-4 text-sm leading-relaxed"><Info size={21} className="shrink-0 text-blue-500" /><div>{children}</div></div>;
}
export function Action({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="settings-action">{children}</button>;
}
export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={onChange} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-primary" : "bg-slate-300"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "left-1 translate-x-5" : "left-1"}`} /></button>;
}
