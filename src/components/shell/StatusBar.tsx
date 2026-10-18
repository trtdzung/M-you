"use client";

import { useEffect, useState } from "react";
import { Signal, Wifi, BatteryFull } from "lucide-react";

/** Compact status strip; intentionally no simulated hardware or Dynamic Island. */
export function StatusBar() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setTime(new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date()));
    update();
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <div className="status-bar relative flex min-h-12 shrink-0 items-center justify-between bg-transparent px-6 pb-1 pt-[calc(var(--safe-area-top)+0.5rem)] text-sm font-semibold text-[color:var(--shell-ink,#ffffff)]">
      <span className="tabular-nums" aria-label="Giờ hiện tại">{time ?? "--:--"}</span>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <Signal size={15} />
        <Wifi size={15} />
        <BatteryFull size={18} />
      </div>
    </div>
  );
}
