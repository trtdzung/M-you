const WEEKS_PER_MONTH = 4.345;

export interface WithdrawTradeoff {
  weeks: number | "unknown";
  amount: number;
}

/** How many weeks of saving a withdrawal sets the goal back; unknown without a usable pace. */
export function withdrawTradeoff(input: {
  amount: number;
  monthlyPace: number | null;
}): WithdrawTradeoff {
  const { amount, monthlyPace } = input;
  if (monthlyPace === null || monthlyPace <= 0) return { weeks: "unknown", amount };
  return { weeks: Math.round(amount / (monthlyPace / WEEKS_PER_MONTH)), amount };
}
