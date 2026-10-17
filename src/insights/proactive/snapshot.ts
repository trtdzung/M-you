/** Financial snapshot v2. Pure: financial facts and hypotheses stay separate. */
import type { Asset, Goal, JarConfig, Liability, StoredCategory, Transaction } from "@/domain/models";
import { computeFinancials, type RawData } from "@/domain/engine/finance-compose";
import { aggregateCashflow, netExpenseByCategory } from "@/domain/engine/cashflow";
import { addMonthsToKey, dateToMonthKey, monthPeriodFromKey, VN_UTC_OFFSET_MS, type Period } from "@/domain/engine/types";

export type InsightTopic = "payment" | "spending" | "allocation" | "investment";
export interface SnapshotCandidate {
  id: string;
  topic: InsightTopic;
  priority: number;
  severity: "urgent" | "attention" | "info";
  confidence: "recorded" | "estimated";
  title: string;
  body: string;
  metric: { label: string; value: number; unit: "VND" };
  facts: Record<string, string | number | null>;
  action: "overview" | "chat";
  question: string;
}

export interface SnapshotOverlay {
  assets: Asset[];
  liabilities: Liability[];
  goals: Goal[];
  complete: boolean;
}
const DAY = 86_400_000;
export function vnDate(iso: string): string {
  return new Date(Date.parse(iso) + VN_UTC_OFFSET_MS).toISOString().slice(0, 10);
}
const round = (n: number) => Math.round(n);

export function buildCustomerSnapshot(raw: RawData, jarConfig: JarConfig, categories: StoredCategory[],
  overlay: SnapshotOverlay, sessionTopups: Transaction[], now: Date) {
  const asOf = now.toISOString();
  const today = vnDate(asOf);
  const month = dateToMonthKey(now);
  // Demo clock identifies a reporting DAY. Include that entire VN day, never future days.
  const dayStart = Date.parse(`${today}T00:00:00+07:00`);
  const dayEnd = dayStart + DAY - 1;
  const txns = [...raw.transactions, ...sessionTopups].filter((t) => Date.parse(t.postedAt) <= dayEnd);
  const fin = computeFinancials(raw, month, { transactions: txns, now, jarConfig, categories,
    userAssets: overlay.assets, userLiabilities: overlay.liabilities, userGoals: overlay.goals });
  const liabilities = [...raw.liabilities, ...overlay.liabilities];
  const assets = [...raw.assets, ...overlay.assets];
  const goals = fin.goals;
  const fixed = new Set(categories.filter((c) => c.fixed).map((c) => c.id));
  const period = (days: number): Period => ({ from: new Date(dayStart - (days - 1) * DAY).toISOString(),
    to: new Date(dayEnd).toISOString(), label: `last_${days}_days` });
  const cash = (p: Period) => aggregateCashflow(txns, p, fixed);
  const todayCash = cash(period(1));
  const previousMonth = addMonthsToKey(month, -1);
  const priorPeriod = monthPeriodFromKey(previousMonth);
  const priorDayCount = Math.min(Number(today.slice(-2)), new Date(Date.parse(priorPeriod.to) + VN_UTC_OFFSET_MS).getUTCDate());
  const priorComparable = cash({ ...priorPeriod,
    to: new Date(Date.parse(priorPeriod.from) + priorDayCount * DAY - 1).toISOString() });
  const last7 = netExpenseByCategory(txns, period(7));
  const last30 = netExpenseByCategory(txns, period(30));
  const candidates: SnapshotCandidate[] = [];
  // A liability's minimum payment is never relabelled as a full card statement.
  const payments = liabilities.flatMap((l) => {
    if (!l.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(l.dueDate)) return [];
    const due = Date.parse(`${l.dueDate}T00:00:00+07:00`);
    if (!Number.isFinite(due) || vnDate(new Date(due).toISOString()) !== l.dueDate) return [];
    const days = round((due - dayStart) / DAY);
    return days >= 0 && days <= 30 ? [{ id: l.id, label: l.name, amount: l.minimumPayment,
      dueDate: l.dueDate, daysUntilDue: days, amountMeaning: "minimum_payment", source: l.source }] : [];
  });
  payments.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  const bills = fin.obligations.filter((o) => o.kind === "recurring")
    .map((o) => ({ ...o, source: "estimated" as const, amountMeaning: "predicted_recurring_bill" }));
  const dueSoon = payments.filter((p) => p.amount !== null && p.amount > 0 && p.daysUntilDue <= 7);
  const dueAmount = dueSoon.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  if (dueAmount > 0) candidates.push({ id: "payment:next7", topic: "payment", priority: 0,
    severity: "urgent", confidence: "recorded", title: "Sắp đến hạn thanh toán tối thiểu",
    body: "Kiểm tra lịch trả và số tiền tối thiểu đã ghi nhận trước ngày đến hạn.",
    metric: { label: "Thanh toán tối thiểu trong bảy ngày", value: dueAmount, unit: "VND" },
    facts: { minimum_due: dueAmount, count: dueSoon.length, nearest_due: dueSoon[0].dueDate,
      items: dueSoon.map(p => ({ id: p.id, label: p.label, amount: p.amount, due: p.dueDate, days_until_due: p.daysUntilDue })) },
    action: "overview", question: "Giúp tôi xem các khoản sắp phải trả: từng khoản vay/thẻ nào, số tiền tối thiểu bao nhiêu, ngày đến hạn, và phân biệt trả tối thiểu với trả toàn bộ." });
  const predictedSoon = bills.filter((b) => Date.parse(b.dueDate) >= dayStart && Date.parse(b.dueDate) <= dayEnd + 7 * DAY && typeof b.amount === "number");
  const billAmount = predictedSoon.reduce((sum, b) => sum + (typeof b.amount === "number" ? b.amount : 0), 0);
  if (billAmount > 0) candidates.push({ id: "payment:bills", topic: "payment", priority: 1,
    severity: "attention", confidence: "estimated", title: "Dự kiến có hóa đơn sắp tới",
    body: "Lịch chi định kỳ gợi ý bạn nên kiểm tra hóa đơn và để dành tiền thanh toán.",
    metric: { label: "Hóa đơn ước tính trong bảy ngày", value: round(billAmount), unit: "VND" },
    facts: { estimated_bill_total: round(billAmount), count: predictedSoon.length,
      items: predictedSoon.map(b => ({ label: b.label ?? b.id, amount: typeof b.amount === "number" ? round(b.amount) : null, due: b.dueDate })) },
    action: "overview", question: "Giúp tôi kiểm tra các hóa đơn định kỳ dự kiến: từng hóa đơn tên gì, số tiền bao nhiêu, ngày nào, và khoản nào đã được xác nhận thực sự." });

  const jars = fin.jarBudget.lines.map((line) => {
    const activeDays = new Set(txns.filter((t) => t.status === "posted" &&
      (t.type === "expense" || t.type === "fee") && line.categoryIds.includes(t.categoryId) &&
      Date.parse(t.postedAt) >= Date.parse(period(30).from)).map((t) => vnDate(t.postedAt))).size;
    const variable = line.categoryIds.length > 0 && !line.categoryIds.some((id) => fixed.has(id));
    const burn = variable && activeDays >= 3 ? Math.max(0,
      0.6 * line.categoryIds.reduce((s, id) => s + (last7.get(id) ?? 0), 0) / 7 +
      0.4 * line.categoryIds.reduce((s, id) => s + (last30.get(id) ?? 0), 0) / 30) : null;
    const remaining = line.remaining;
    const burnRisk = remaining !== null && remaining > 0 && burn !== null && burn * fin.jarBudget.summary.daysLeft > remaining;
    const pressure = remaining !== null && (remaining < 0 || (line.limit !== null && line.limit > 0 && line.spent >= line.limit * 0.8));
    // Prior month spend for this jar's categories
    const priorMonthTxns = txns.filter(t => Date.parse(t.postedAt) >= Date.parse(priorPeriod.from) && Date.parse(t.postedAt) <= Date.parse(priorPeriod.to));
    const priorMonthByCategory = netExpenseByCategory(priorMonthTxns, { from: priorPeriod.from, to: priorPeriod.to, label: "prior" });
    const priorMonthSpend = line.categoryIds.reduce((s, id) => s + (priorMonthByCategory.get(id) ?? 0), 0);
    if (pressure || burnRisk) candidates.push({ id: `spending:jar:${line.huId}`, topic: "spending", priority: 1,
      severity: remaining !== null && remaining < 0 ? "urgent" : "attention", confidence: burnRisk ? "estimated" : "recorded",
      title: remaining !== null && remaining < 0 ? "Hũ chi tiêu đang cần bù" : burnRisk ? "Hũ có thể cạn trước cuối tháng" : "Hũ đang gần hoặc vượt hạn mức",
      body: burnRisk ? "Nhịp chi gần đây có thể khiến hũ hết sớm. Cùng M-Your xem khoản nào có thể điều chỉnh." :
        "Xem lại chi tiêu trong hũ và trao đổi với M-Your về cách điều chỉnh phù hợp.",
      metric: { label: `Còn lại · ${line.label}`, value: round(remaining ?? 0), unit: "VND" },
      facts: { jar_label: line.label, remaining, spent: line.spent, limit: line.limit,
        daily_burn: burn === null ? null : round(burn), days_left: fin.jarBudget.summary.daysLeft,
        days_to_empty: burn && remaining !== null && remaining > 0 ? Math.floor(remaining / burn) : null,
        prior_month_spend: round(priorMonthSpend),
        mom_delta: line.spent !== null && priorMonthSpend > 0 ? round(line.spent - priorMonthSpend) : null,
        active_days_last30: activeDays },
      action: "chat", question: `Phân tích hũ ${line.label} cho tôi: đã chi bao nhiêu, trung bình mỗi ngày bao nhiêu, so với tháng trước thế nào, còn lại bao nhiêu và dự báo có hết trước cuối tháng không. Các khoản chi nổi bật là gì? Gợi ý cách điều chỉnh nhưng hỏi tôi trước khi đề xuất chuyển tiền giữa các hũ.` });
    return { ...line, estimatedDailyBurn: burn === null ? null : round(burn), activeDays,
      burnRisk, forecastCoverage: variable ? activeDays >= 3 ? "sufficient" : "sparse" : "fixed_or_empty_categories" };
  });
  const baseline = Math.max(0, cash(period(30)).expense - todayCash.expense) / 29;
  if (baseline > 0 && todayCash.expense > baseline * 1.5 && todayCash.expense - baseline >= 200_000) {
    candidates.push({ id: "spending:today", topic: "spending", priority: 2, severity: "attention", confidence: "estimated",
      title: "Chi tiêu hôm nay cao hơn thường lệ", body: "Cùng M-Your xem những khoản chi làm hôm nay khác với nhịp chi gần đây.",
      metric: { label: "Đã chi hôm nay", value: todayCash.expense, unit: "VND" },
      facts: { today_spend: todayCash.expense, daily_baseline: round(baseline) }, action: "chat",
      question: "Hôm nay tôi chi nhiều ở đâu? Phân tích các khoản lớn và gợi ý điều chỉnh, không suy đoán nguyên nhân khi chưa có dữ liệu." });
  }
  if (priorComparable.expense > 0 && fin.cashflow.expense > priorComparable.expense * 1.3 &&
    fin.cashflow.expense - priorComparable.expense >= 500_000) candidates.push({ id: "spending:month", topic: "spending",
    priority: 2, severity: "attention", confidence: "recorded", title: "Chi tháng này đang tăng",
    body: "Chi tiêu từ đầu tháng cao hơn cùng kỳ tháng trước. Cùng xem các danh mục đóng góp nhiều nhất.",
    metric: { label: "Đã chi từ đầu tháng", value: fin.cashflow.expense, unit: "VND" },
    facts: { current_spend: fin.cashflow.expense, previous_comparable_spend: priorComparable.expense,
      mom_delta: round(fin.cashflow.expense - priorComparable.expense),
      mom_pct: round((fin.cashflow.expense / priorComparable.expense - 1) * 100) },
    action: "chat",
    question: "So sánh chi tiêu tháng này với cùng kỳ tháng trước: tổng đã chi bao nhiêu, tăng bao nhiêu (cả số tiền lẫn %), danh mục nào tăng nhiều nhất, và gợi ý các khoản tôi có thể điều chỉnh." });

  const pool = fin.unallocatedPool.amount === "unknown" ? null : fin.unallocatedPool.amount;
  const dueReserve = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const estimatedBillReserve = bills.reduce((sum, p) => sum + (typeof p.amount === "number" ? p.amount : 0), 0);
  const goalReserve = goals.reduce((sum, g) => sum + Math.max(0, g.targetAmount - g.currentAmount), 0);
  const buffer = Math.max(10_000_000, Math.max(fin.cashflow.expense, fin.prevCashflow.expense) * 3);
  const debtsKnown = liabilities.every((l) => l.outstandingPrincipal !== null &&
    (l.outstandingPrincipal === 0 || (l.minimumPayment !== null && l.minimumPayment > 0 && l.interestRate !== null &&
      l.interestRate < 0.2 && l.dueDate !== null && Date.parse(`${l.dueDate}T23:59:59+07:00`) >= dayStart)));
  const eligible = overlay.complete && debtsKnown && pool !== null && fin.prevCashflow.expense > 0 &&
    jars.every((j) => j.categoryIds.length === 0 || (j.limit !== null && j.remaining !== null && j.remaining >= 0)) &&
    !candidates.some((c) => c.priority <= 2) && fin.unlabeled.amount === 0;
  const estimatedSurplus = eligible ? Math.max(0, (pool ?? 0) - dueReserve - estimatedBillReserve - goalReserve - buffer) : null;
  if (estimatedSurplus !== null && estimatedSurplus >= 5_000_000) candidates.push({ id: "investment:discovery", topic: "investment",
    priority: 3, severity: "info", confidence: "estimated", title: "Có thể tìm hiểu phương án sinh lời",
    body: "Sau các khoản giữ lại theo giả định hiện tại, bạn có thể trao đổi thêm về thời hạn và mức rủi ro phù hợp.",
    metric: { label: "Phần dư ước tính để trao đổi thêm", value: estimatedSurplus, unit: "VND" },
    facts: { estimated_surplus: estimatedSurplus, buffer, due_reserve: dueReserve, goal_reserve: goalReserve }, action: "chat",
    question: "Tôi muốn tìm hiểu phương án sinh lời cho phần tiền dư ước tính. Hãy hỏi thời gian cần dùng tiền, quỹ dự phòng và mức chấp nhận rủi ro trước khi gợi ý. Không coi đây là số tiền chắc chắn đầu tư được." });
  if (pool !== null && pool >= 100_000) candidates.push({ id: "allocation:pool", topic: "allocation", priority: 4,
    severity: "info", confidence: "recorded", title: "Bạn có tiền chưa phân bổ vào hũ",
    body: "Cùng M-Your chọn số tiền muốn chia và ưu tiên các hũ. Phần này có thể còn cần cho các khoản sắp trả.",
    metric: { label: "Chưa phân bổ", value: pool, unit: "VND" }, facts: { unallocated: pool, known_due_reserve: dueReserve },
    action: "chat", question: "Tôi muốn chia tiền chưa phân bổ vào các hũ. Trước tiên hãy hỏi tôi muốn chia bao nhiêu và ưu tiên hũ nào, rồi đề xuất phương án để tôi xác nhận." });
  candidates.sort((a, b) => a.priority - b.priority || Number(b.severity === "urgent") - Number(a.severity === "urgent") || a.id.localeCompare(b.id));
  const history = Array.from({ length: 6 }, (_, i) => {
    const key = addMonthsToKey(month, -i);
    return { month: key, ...cash(monthPeriodFromKey(key)) };
  });
  const daily = Array.from({ length: 30 }, (_, i) => {
    const from = dayStart - i * DAY;
    const value = cash({ from: new Date(from).toISOString(), to: new Date(from + DAY - 1).toISOString(), label: "day" });
    return { date: vnDate(new Date(from).toISOString()), income: value.income, expense: value.expense };
  });
  const sorted = txns.slice().sort((a, b) => b.postedAt.localeCompare(a.postedAt) || a.id.localeCompare(b.id));
  return {
    schemaVersion: "2.0", asOf: today, timezone: "Asia/Ho_Chi_Minh", currency: "VND", period: month,
    dataQuality: { mode: "demo", profileComplete: overlay.complete, transactionCount: txns.length,
      transactionRowsIncluded: Math.min(500, txns.length), transactionRowsTruncated: txns.length > 500,
      aggregatesUseAllRows: true, sessionTopups: sessionTopups.length,
      missing: [!overlay.complete && "self_reported_profile", "full_card_statement_balance", "confirmed_bill_feed", "investment_risk_profile"].filter(Boolean) },
    accounts: raw.accounts.map((a) => ({ id: a.id, type: a.type, currency: a.currency,
      balance: a.balance, availableBalance: a.availableBalance, source: a.source, lastSyncedAt: a.lastSyncedAt })),
    assets, liabilities, goals, categories, budgets: raw.budgets, spendingByCategory: fin.categorySpend,
    cashflow: { today: todayCash, monthToDate: fin.cashflow, previousComparable: priorComparable, monthly: history, daily },
    jars, unallocated: fin.unallocatedPool, payments, predictedBills: bills, recurring: fin.recurring,
    networth: fin.networth, health: fin.health, endOfMonth: fin.endOfMonth, runway: fin.runway, unlabeled: fin.unlabeled,
    opportunity: { estimatedSurplus, buffer, dueReserve, estimatedBillReserve, goalReserve, eligible },
    historicalNetworth: raw.snapshots,
    transactions: sorted.slice(0, 500).map((t) => ({ id: t.id, postedAt: t.postedAt, amount: t.amount, currency: t.currency,
      direction: t.direction, type: t.type, categoryId: t.categoryId, merchant: t.merchantName.slice(0, 100),
      status: t.status, source: t.source, recurring: t.isRecurring, rebalance: t.rebalance })),
    candidates,
  };
}
export type CustomerFinancialSnapshot = ReturnType<typeof buildCustomerSnapshot>;
