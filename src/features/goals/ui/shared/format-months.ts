/** "34" -> "2 năm 10 tháng". */
export function formatMonths(n: number): string {
  const years = Math.floor(n / 12);
  const months = n % 12;
  if (years === 0) return `${months} tháng`;
  return months === 0 ? `${years} năm` : `${years} năm ${months} tháng`;
}
