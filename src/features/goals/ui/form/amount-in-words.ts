const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const UNITS = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];

function readGroup(value: number, full: boolean): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;
  const words: string[] = [];
  if (hundreds || full) words.push(DIGITS[hundreds], "trăm");
  if (tens > 1) words.push(DIGITS[tens], "mươi");
  else if (tens === 1) words.push("mười");
  else if (ones && (hundreds || full)) words.push("lẻ");
  if (ones) words.push(ones === 1 && tens > 1 ? "mốt" : ones === 5 && tens > 0 ? "lăm" : DIGITS[ones]);
  return words.join(" ");
}

export function amountInWords(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) return "";
  if (amount === 0) return "Không đồng";
  const groups: number[] = [];
  let remaining = amount;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  const words: string[] = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    if (!groups[index]) continue;
    words.push(readGroup(groups[index], index < groups.length - 1), UNITS[index]);
  }
  const result = words.filter(Boolean).join(" ");
  return `${result[0].toUpperCase()}${result.slice(1)} đồng`;
}
