/**
 * Income vs expense series colors for the Tổng quan thu chi charts, on the MSB
 * theme: Thu nhập uses the semantic positive green, Chi tiêu the MSB brand orange
 * (`--color-primary`). Kept in one place so the bars (Tổng quan) and the lines
 * (Biến động) stay identical.
 */

export const INCOME_COLOR = "#16a34a"; // Thu nhập — MSB positive green
export const EXPENSE_COLOR = "#f26522"; // Chi tiêu — MSB brand cam

/** Vertical gradient stops (top → bottom) for the solid bars. */
export const INCOME_GRADIENT = { from: "#22c55e", to: "#15803d" };
export const EXPENSE_GRADIENT = { from: "#f5822c", to: "#e8321e" };
