import { Signal, Wifi, BatteryFull } from "lucide-react";

/** Mock iOS status bar (iPhone 17 Pro Max) với Dynamic Island để củng cố khung điện thoại. */
export function StatusBar() {
  return (
    <div className="relative flex shrink-0 items-center justify-between px-6 pb-1 pt-3 text-sm font-semibold text-text">
      <span>9:41</span>
      <span
        className="absolute left-1/2 top-2.5 h-6 w-24 -translate-x-1/2 rounded-full bg-neutral-900"
        aria-hidden="true"
      />
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <Signal size={15} />
        <Wifi size={15} />
        <BatteryFull size={18} />
      </div>
    </div>
  );
}
