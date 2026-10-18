"use client";

// Test-tools state (demo only): a simulated hour used ONLY to judge the
// transfer alert on Confirm. Kept apart from the Scam Shield store and saved in
// sessionStorage so it never mixes into a persona's security data.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { transferNow } from "@/lib/demo-clock";

type TestToolsStore = {
  /** Hour (0–23, Vietnam time) the alert is judged at; null = the real clock. */
  alertHour: number | null;
  setAlertHour: (hour: number | null) => void;
};

export const useTestToolsStore = create<TestToolsStore>()(
  persist(
    (set) => ({
      alertHour: null,
      setAlertHour: (hour) => set({ alertHour: hour }),
    }),
    {
      name: "msb-pfm.test-tools",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ alertHour: state.alertHour }),
    },
  ),
);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const VN_OFFSET_MS = 7 * HOUR_MS;

/** The time the transfer alert is judged at: `now`, or the same VN day at `alertHour`:00. */
export function alertClock(now: Date = transferNow()): Date {
  const { alertHour } = useTestToolsStore.getState();
  if (alertHour === null) return now;
  const vnDayStart = Math.floor((now.getTime() + VN_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(vnDayStart + alertHour * HOUR_MS - VN_OFFSET_MS);
}
