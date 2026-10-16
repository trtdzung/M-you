import { Signal, Wifi, BatteryFull } from "lucide-react";

/** Compact status strip; intentionally no simulated hardware or Dynamic Island. */
export function StatusBar() {
  return (
    <div className="relative flex min-h-12 shrink-0 items-center justify-between bg-transparent px-6 pb-1 pt-[calc(var(--safe-area-top)+0.5rem)] text-sm font-semibold text-[color:var(--shell-ink,#ffffff)]">
      <span>9:41</span>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <Signal size={15} />
        <Wifi size={15} />
        <BatteryFull size={18} />
      </div>
    </div>
  );
}
