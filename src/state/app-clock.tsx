"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePersonaCif } from "@/providers/context";
import { APP_CLOCK_REFRESH_EVENT, setClientAppClock, transferNow } from "@/lib/demo-clock";
import { dateToMonthKey } from "@/domain/engine/types";
import { usePeriod } from "@/state/period";

interface ClockView {
  now: string;
  today: string;
  monthKey: string;
  offsetMs: number;
}

const ClockContext = createContext<ClockView | null>(null);

export function AppClockProvider({ children }: { children: React.ReactNode }) {
  const cif = usePersonaCif();
  return <CustomerClock key={cif} cif={cif}>{children}</CustomerClock>;
}

function CustomerClock({ cif, children }: { cif: string | null; children: React.ReactNode }) {
  const [clock, setClock] = useState<ClockView | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    let generation = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const load = async () => {
      clearTimeout(retryTimer);
      const run = ++generation;
      if (!cif) return;
      try {
        const res = await fetch(`/api/clock?cif=${encodeURIComponent(cif)}`, { cache: "no-store" });
        if (!res.ok) throw new Error("clock unavailable");
        const next = await res.json() as ClockView;
        if (!alive || run !== generation) return;
        setClientAppClock(next.now, next.offsetMs);
        setClock(next);
        failures = 0;
        setError(false);
      } catch {
        if (alive && run === generation) {
          setError(true);
          const delay = [2000, 5000, 15000][failures++] ?? 30000;
          retryTimer = setTimeout(() => void load(), delay);
        }
      }
    };
    const refresh = (event: Event) => {
      if ((event as CustomEvent<string>).detail === cif) void load();
    };
    const focus = () => { if (failures > 0) void load(); };
    setClientAppClock(null);
    void load();
    window.addEventListener("focus", focus);
    window.addEventListener(APP_CLOCK_REFRESH_EVENT, refresh);
    const timer = window.setInterval(() => {
      setClock(current => {
        if (!current) return current;
        const now = transferNow();
        return { ...current, now: now.toISOString(), today: new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10), monthKey: dateToMonthKey(now) };
      });
    }, 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      clearTimeout(retryTimer);
      window.removeEventListener("focus", focus);
      setClientAppClock(null);
      window.removeEventListener(APP_CLOCK_REFRESH_EVENT, refresh);
    };
  }, [cif, retry]);

  if (error && !clock) return <div role="alert">Không tải được đồng hồ. <button onClick={() => setRetry(value => value + 1)}>Thử lại</button></div>;
  if (!clock) return <div role="status">Đang tải đồng hồ…</div>;
  return <ClockContext.Provider value={clock}>{error && <div role="alert" className="bg-amber-50 px-3 py-2 text-sm text-amber-900">Chưa cập nhật được ngày hệ thống, đang thử lại…</div>}{children}</ClockContext.Provider>;
}

function useClock(): ClockView {
  const clock = useContext(ClockContext);
  if (!clock) throw new Error("Clock hooks must be used within AppClockProvider");
  return clock;
}

export function useAppNow(): Date {
  const clock = useContext(ClockContext);
  return useMemo(() => clock ? new Date(clock.now) : transferNow(), [clock]);
}
export function useAppToday(): string {
  const now = useAppNow();
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function useAppMonthKey(): string { return dateToMonthKey(useAppNow()); }

/** A changed offset also resets a manually selected reporting period. */
export function AppClockPeriodSync() {
  const { monthKey, offsetMs } = useClock();
  const { setMonth } = usePeriod();
  useEffect(() => { setMonth(monthKey); }, [monthKey, offsetMs, setMonth]);
  return null;
}
