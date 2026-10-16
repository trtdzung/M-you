import { Signal, Wifi, BatteryFull } from "lucide-react";

/** Mock mobile status bar to reinforce the phone-frame illusion. */
export function StatusBar() {
  return (
    <div className="flex items-center justify-between px-5 pt-3 text-xs font-medium text-text">
      <span>9:41</span>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <Signal size={14} />
        <Wifi size={14} />
        <BatteryFull size={16} />
      </div>
    </div>
  );
}
