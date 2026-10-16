"use client";

/**
 * Selected reporting month, shared across Cash Flow / Wealth / Overview so the
 * period picker on one screen affects them all. Defaults to the current demo
 * month; options come from the fixed demo clock.
 */

import { createContext, useContext, useMemo, useState } from "react";
import { availableMonths, currentMonthKey, type MonthOption } from "@/lib/demo-clock";

interface PeriodContextValue {
  month: string;
  setMonth: (key: string) => void;
  options: MonthOption[];
}

const PeriodContext = createContext<PeriodContextValue | null>(null);

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [month, setMonth] = useState<string>(currentMonthKey());
  const value = useMemo<PeriodContextValue>(
    () => ({ month, setMonth, options: availableMonths() }),
    [month],
  );
  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod(): PeriodContextValue {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("usePeriod must be used within <PeriodProvider>");
  return ctx;
}
