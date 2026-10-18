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
  /** Last preset applied, with a signature of the state it produced (see test-tools/actions.ts). */
  appliedPreset: { id: string; signature: string } | null;
  setAppliedPreset: (applied: { id: string; signature: string } | null) => void;
};

export const useTestToolsStore = create<TestToolsStore>()(
  persist(
    (set) => ({
      alertHour: null,
      setAlertHour: (hour) => set({ alertHour: hour }),
      appliedPreset: null,
      setAppliedPreset: (applied) => set({ appliedPreset: applied }),
    }),
    {
      name: "msb-pfm.test-tools",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ alertHour: state.alertHour, appliedPreset: state.appliedPreset }),
    },
  ),
);

type TestToolsFabStore = {
  /** Floating shortcut to the test-tools screen on every screen; off by default. */
  showFab: boolean;
  setShowFab: (on: boolean) => void;
  /** Where the tester dragged the button, as 0–1 of the free space in the phone frame; null = default spot. */
  fabPos: { x: number; y: number } | null;
  setFabPos: (pos: { x: number; y: number }) => void;
};

// Kept in localStorage (not per tab like the alert hour) so a tester switches it on once per browser.
export const useTestToolsFabStore = create<TestToolsFabStore>()(
  persist(
    (set) => ({
      showFab: false,
      setShowFab: (on) => set({ showFab: on }),
      fabPos: null,
      setFabPos: (pos) => set({ fabPos: pos }),
    }),
    {
      name: "msb-pfm.test-tools-fab",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ showFab: state.showFab, fabPos: state.fabPos }),
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
