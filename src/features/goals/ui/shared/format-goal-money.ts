/** Readable compact VND amount; always use comma grouping for full amounts. */
export function formatGoalMoney(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} triệu`;
  return amount.toLocaleString("en-US");
}
