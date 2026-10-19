import "server-only";

/**
 * Hồ sơ khách của Mục tiêu dựng từ dữ liệu thật (cùng cách dựng danh sách giao
 * dịch như `/api/jar-summary`). Chỉ đọc — không ghi gì. Số liệu lấy từ 3 tháng
 * trọn vẹn trước tháng của `today`; engine dòng tiền đã loại chuyển khoản và
 * thanh toán thẻ khỏi chi tiêu.
 */

import { FIXED_CATEGORY_IDS, type Transaction } from "@/domain/models";
import { aggregateCashflow, isoInPeriod, monthPeriod, VN_UTC_OFFSET_MS } from "@/domain/engine";
import { readAccounts } from "@/lib/accounts-store";
import { readCorrections } from "@/lib/corrections-store";
import { readManualTxns } from "@/lib/manual-txns-store";
import { readTransactions } from "@/lib/transactions-store";
import { PERSONA_LIST } from "@/providers/mock/personas";
import { applyCorrections, isHidden } from "@/state/corrections-core";
import type { CustomerProfile, ISODate, RiskProfile } from "../model/types";

const WINDOW_MONTHS = 3;
/** Giao dịch trên tài khoản mục tiêu (id `goalacc-*`) không phải thu/chi của khách. */
const GOAL_ACCOUNT_PREFIX = "goalacc-";

const vnShifted = (iso: string): Date => new Date(new Date(iso).getTime() + VN_UTC_OFFSET_MS);
const vnMonthKey = (iso: string): string => vnShifted(iso).toISOString().slice(0, 7);

export function buildCustomerProfile(cif: string, today: ISODate, riskProfile: RiskProfile): CustomerProfile {
  const persona = PERSONA_LIST.find((p) => p.cif === cif);
  if (!persona) throw new RangeError("Unknown customer");
  const main = readAccounts(cif).find((a) => a.type === "current");
  if (!main) throw new RangeError("Unknown customer");

  const corrections = readCorrections(cif);
  const endOfToday = new Date(`${today}T23:59:59.999+07:00`).getTime();
  const txns: Transaction[] = applyCorrections([...readManualTxns(cif), ...readTransactions(cif)], corrections).filter(
    (t) =>
      !isHidden(corrections, t.id) &&
      !t.accountId.startsWith(GOAL_ACCOUNT_PREFIX) &&
      new Date(t.postedAt).getTime() <= endOfToday,
  );

  // dataMonths: số tháng (lịch VN) có giao dịch tính tới today.
  const dataMonths = new Set(txns.map((t) => vnMonthKey(t.postedAt))).size;

  // 3 tháng trọn vẹn trước tháng của today.
  const [y, m] = today.split("-").map(Number);
  const periods = Array.from({ length: WINDOW_MONTHS }, (_, i) => monthPeriod(y, m - 1 - (i + 1)));
  const cash = periods.map((p) => aggregateCashflow(txns, p, FIXED_CATEGORY_IDS));
  const debtPerMonth = periods.map((p) =>
    txns
      .filter((t) => t.type === "card_payment" && t.status === "posted" && isoInPeriod(t.postedAt, p))
      .reduce((s, t) => s + t.amount, 0),
  );
  // Chia cho số tháng trong kỳ thực sự có dữ liệu (tối thiểu 1), không chia cho tháng trống.
  const monthsWithData = cash.filter((c) => c.meta.sourceCoverage.knownCount > 0).length || 1;
  const avg = (sum: number) => Math.round(sum / monthsWithData);

  const monthlyIncome = avg(cash.reduce((s, c) => s + c.income, 0));
  const monthlyExpenses = avg(cash.reduce((s, c) => s + c.expense, 0));
  const existingDebtPayment = avg(debtPerMonth.reduce((s, d) => s + d, 0));
  const monthlySurplus = dataMonths < WINDOW_MONTHS ? "unknown" : monthlyIncome - monthlyExpenses - existingDebtPayment;

  // Ngày nhận lương: ngày hay gặp nhất của khoản thu ≥ 50% thu nhập TB; không có → khoản thu lớn nhất.
  const incomes = txns.filter(
    (t) => t.type === "income" && t.status === "posted" && periods.some((p) => isoInPeriod(t.postedAt, p)),
  );
  const dayOf = (t: Transaction) => vnShifted(t.postedAt).getUTCDate();
  const big = incomes.filter((t) => t.amount >= monthlyIncome * 0.5);
  let salaryDay = 1;
  if (big.length > 0) {
    const counts = new Map<number, number>();
    for (const t of big) counts.set(dayOf(t), (counts.get(dayOf(t)) ?? 0) + 1);
    salaryDay = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  } else if (incomes.length > 0) {
    salaryDay = dayOf(incomes.reduce((a, b) => (b.amount > a.amount ? b : a)));
  }
  salaryDay = Math.min(28, Math.max(1, salaryDay));

  return {
    name: persona.label.split(" — ")[0],
    cif,
    monthlyIncome,
    monthlySurplus,
    monthlyExpenses,
    existingDebtPayment,
    mainCasaNumber: main.accountNumber,
    mainCasaBalance: main.availableBalance,
    salaryDay,
    riskProfile,
    dataMonths,
  };
}
