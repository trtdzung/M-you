import { getInvestProduct, getLoanProduct } from "../data/products";
import { DEFAULT_SCENARIO_ID, getScenario } from "../data/scenarios";
import { makeAsset } from "../engine/assets";
import { advanceTime, applySalary, describeAdvance, payDueInstalments, runStandingOrder } from "../engine/advance";
import { addMonths, daysBetween, monthsBetween, nextDayOfMonth } from "../engine/dates";
import { findGoal, goalBalance, makeAccountNumber, nextId, postTxn } from "../engine/ledger";
import { applyLifecycle, refreshLoanStatuses } from "../engine/lifecycle";
import { affordability, annuityPayment, buildSchedule, outstandingPrincipal } from "../engine/loan";
import { assetValue, depositAccrued, fundPriceAt, goalValue } from "../engine/value";
import type { PreviewState } from "../model/state";
import type { ScreenEntry, ScreenId, ScreenParams } from "../model/screens";
import type { Goal, LiquidAsset, ToastTone } from "../model/types";
import { formatVnd } from "@/lib/format";
import type { PreviewAction, SimEvent } from "./actions";

export const STORAGE_KEY = "goals-preview:v1";
const MAX_TOASTS = 4;

// ---------------------------------------------------------------- init

function entry(seq: number, screen: ScreenId, params: ScreenParams = {}): ScreenEntry {
  return { key: `s${seq}-${screen}`, screen, params };
}

export function stateFromScenario(scenarioId: string, jump = false): PreviewState {
  const scenario = getScenario(scenarioId);
  const world = scenario.build();
  const stack: ScreenEntry[] = [entry(1, "FlowMap")];
  if (jump && scenario.jumpTo) stack.push(entry(2, scenario.jumpTo.screen, scenario.jumpTo.params));
  return { ...world, dismissedSuggestionIds: [], nav: { stack }, toasts: [] };
}

export function initialPreviewState(): PreviewState {
  return stateFromScenario(DEFAULT_SCENARIO_ID);
}

// ---------------------------------------------------------------- helpers

function toast(draft: PreviewState, message: string, tone: ToastTone = "success"): void {
  draft.toasts = [...draft.toasts, { id: nextId(draft, "toast"), message, tone }].slice(-MAX_TOASTS);
}

/** Returns the original state with only an error toast added (no world change). */
function fail(state: PreviewState, message: string): PreviewState {
  const draft = { ...state, toasts: [...state.toasts] };
  toast(draft, message, "error");
  return draft;
}

function lifecycle(draft: PreviewState): void {
  for (const event of applyLifecycle(draft, draft.clock.today)) {
    toast(draft, event.message, event.kind === "missed" ? "warning" : "success");
  }
}

function nextPriority(draft: PreviewState): number {
  return draft.goals.reduce((max, g) => Math.max(max, g.priority), 0) + 1;
}

function liquidSaleValue(draft: PreviewState, asset: LiquidAsset): { gross: number; fee: number; note: string } {
  const today = draft.clock.today;
  const product = getInvestProduct(asset.productId);
  if (asset.category === "term_deposit" && asset.principal !== undefined && product?.kind === "term_deposit") {
    const early = asset.status === "held" && asset.maturityDate !== undefined && today < asset.maturityDate;
    if (early) {
      const gross = asset.principal + depositAccrued(asset.principal, product.earlyWithdrawRatePa, asset.createdAt, today);
      return { gross, fee: 0, note: `Tất toán trước hạn (lãi ${product.earlyWithdrawRatePa}%/năm)` };
    }
  }
  const gross = assetValue(asset, draft);
  if (asset.category === "fund" && product?.kind === "fund" && monthsBetween(asset.createdAt, today) < product.feeFreeAfterMonths) {
    const fee = Math.round((gross * product.sellFeePct) / 100);
    return { gross, fee, note: `Phí bán ${product.sellFeePct}%` };
  }
  return { gross, fee: 0, note: "" };
}

/** Sells a liquid asset fully into the goal account (mutates). Returns proceeds. */
function liquidate(draft: PreviewState, goal: Goal, asset: LiquidAsset, fraction = 1): number {
  const { gross, fee, note } = liquidSaleValue(draft, asset);
  const proceeds = Math.round((gross - fee) * fraction);
  postTxn(draft, goal, "divest", proceeds, draft.clock.today, `Bán ${asset.name}${note ? ` · ${note}` : ""}`);
  if (fraction >= 1) {
    asset.status = "sold";
  } else {
    const keep = 1 - fraction;
    if (asset.units !== undefined) asset.units = Math.round(asset.units * keep * 100) / 100;
    if (asset.principal !== undefined) asset.principal = Math.round(asset.principal * keep);
    asset.costBasis = Math.round(asset.costBasis * keep);
    asset.value = Math.round(asset.value * keep);
  }
  return proceeds;
}

function refreshFundSnapshots(draft: PreviewState): void {
  for (const asset of draft.assets) {
    if (asset.type !== "liquid" || asset.category !== "fund" || asset.status !== "held" || asset.units === undefined) continue;
    const product = getInvestProduct(asset.productId);
    if (product?.kind !== "fund") continue;
    asset.price = fundPriceAt(product, draft.clock.today, draft.market.fundPriceShiftPct);
    asset.value = Math.round(asset.units * asset.price);
  }
}

// ---------------------------------------------------------------- nav

function navReducer(state: PreviewState, action: PreviewAction): PreviewState | null {
  const stack = state.nav.stack;
  const seq = state.seq + 1;
  switch (action.type) {
    case "nav/params":
      return { ...state, nav: { stack: stack.map((item, index) => index === stack.length - 1 ? { ...item, params: { ...item.params, ...action.params } } : item) } };
    case "nav/push":
      return { ...state, seq, nav: { stack: [...stack, entry(seq, action.screen, action.params)] } };
    case "nav/replace":
      return { ...state, seq, nav: { stack: [...stack.slice(0, -1), entry(seq, action.screen, action.params)] } };
    case "nav/pop": {
      const count = Math.max(1, action.count ?? 1);
      if (stack.length <= 1) return state;
      return { ...state, nav: { stack: stack.slice(0, Math.max(1, stack.length - count)) } };
    }
    case "nav/reset":
      return { ...state, seq, nav: { stack: [entry(seq, action.screen ?? "FlowMap", action.params)] } };
    case "nav/popTo": {
      const index = stack.map((e) => e.screen).lastIndexOf(action.screen);
      if (index === -1) return state;
      return { ...state, nav: { stack: stack.slice(0, index + 1) } };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- reducer

export function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
  const nav = navReducer(state, action);
  if (nav) return nav;

  switch (action.type) {
    case "hydrate":
      return action.state;

    case "reset": {
      const next = stateFromScenario(state.scenarioId);
      toast(next, `Đã đặt lại kịch bản “${getScenario(state.scenarioId).title}”.`, "info");
      return next;
    }

    case "loadScenario": {
      const next = stateFromScenario(action.scenarioId, action.jump ?? true);
      toast(next, `Đã nạp kịch bản: ${getScenario(action.scenarioId).title}`, "info");
      return next;
    }

    case "toast/push": {
      const draft = { ...state };
      toast(draft, action.message, action.tone ?? "info");
      return draft;
    }

    case "toast/dismiss":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    case "dismissSuggestion":
      return state.dismissedSuggestionIds.includes(action.id)
        ? state
        : { ...state, dismissedSuggestionIds: [...state.dismissedSuggestionIds, action.id] };

    case "advanceTime": {
      const { state: next, summary } = advanceTime(state, action.days);
      toast(next, describeAdvance(summary), summary.standingOrdersFailed || summary.instalmentsOverdue ? "warning" : "info");
      return next;
    }
  }

  // Everything below mutates a deep copy of the world.
  const draft = structuredClone(state);
  const today = draft.clock.today;

  switch (action.type) {
    case "setFundPriceShift": {
      draft.market.fundPriceShiftPct = action.pct;
      refreshFundSnapshots(draft);
      toast(draft, `Giá chứng chỉ quỹ ${action.pct >= 0 ? "+" : ""}${action.pct}% so với chuỗi giá gốc.`, "info");
      return draft;
    }

    case "setCustomer": {
      draft.customer = { ...draft.customer, ...action.patch };
      toast(draft, "Đã cập nhật hồ sơ khách hàng mô phỏng.", "info");
      return draft;
    }

    case "triggerEvent":
      return triggerEvent(state, draft, action.event, action.goalId);

    case "createGoal": {
      const id = nextId(draft, "goal");
      draft.goals.push({
        id,
        name: action.input.name.trim() || "Mục tiêu mới",
        template: action.input.template,
        targetAmount: action.input.targetAmount,
        targetDate: action.input.targetDate,
        flexibility: action.input.flexibility,
        priority: action.input.priority ?? nextPriority(draft),
        status: "draft",
        createdAt: today,
        note: action.input.note,
      });
      draft.lastCreatedGoalId = id;
      return draft;
    }

    case "updateDraftGoal": {
      const goal = findGoal(draft, action.goalId);
      if (!goal || goal.status !== "draft") return state;
      Object.assign(goal, action.patch);
      return draft;
    }

    case "discardDraftGoal": {
      draft.goals = draft.goals.filter((g) => !(g.id === action.goalId && g.status === "draft"));
      draft.assets = draft.assets.filter((a) => a.goalId !== action.goalId || draft.goals.some((g) => g.id === a.goalId));
      return draft;
    }

    case "openAccount": {
      const goal = findGoal(draft, action.goalId);
      if (!goal || goal.status !== "draft") return fail(state, "Không tìm thấy mục tiêu nháp.");
      if (action.initialDeposit > draft.customer.mainCasaBalance) return fail(state, "Tài khoản chính không đủ số dư để nạp ban đầu.");
      const accountId = nextId(draft, "acc");
      draft.accounts.push({
        id: accountId,
        goalId: goal.id,
        number: makeAccountNumber(draft.seq),
        name: `TK mục tiêu – ${goal.name}`,
        balance: 0,
        interestRatePa: 0.5,
        openedAt: today,
        status: "open",
      });
      goal.accountId = accountId;
      goal.status = "accumulating";
      goal.createdAt = today;
      if (action.initialDeposit > 0) {
        draft.customer.mainCasaBalance -= action.initialDeposit;
        postTxn(draft, goal, "deposit", action.initialDeposit, today, "Nạp tiền ban đầu");
      }
      lifecycle(draft);
      toast(draft, `Đã mở Tài khoản mục tiêu cho “${goal.name}”.`);
      return draft;
    }

    case "deposit": {
      const goal = findGoal(draft, action.goalId);
      if (!goal?.accountId) return fail(state, "Mục tiêu chưa có tài khoản.");
      if (action.amount <= 0) return fail(state, "Số tiền phải lớn hơn 0.");
      if (action.amount > draft.customer.mainCasaBalance) return fail(state, "Tài khoản chính không đủ số dư.");
      draft.customer.mainCasaBalance -= action.amount;
      postTxn(draft, goal, "deposit", action.amount, today, action.note ?? "Nạp từ tài khoản chính");
      lifecycle(draft);
      toast(draft, `Đã nạp ${formatVnd(action.amount)} vào “${goal.name}”.`);
      return draft;
    }

    case "withdraw": {
      const goal = findGoal(draft, action.goalId);
      if (!goal?.accountId) return fail(state, "Mục tiêu chưa có tài khoản.");
      if (action.amount <= 0) return fail(state, "Số tiền phải lớn hơn 0.");
      if (action.amount > goalBalance(draft, goal)) return fail(state, "Số dư tài khoản mục tiêu không đủ.");
      postTxn(draft, goal, "withdraw", action.amount, today, action.note ?? (action.emergency ? "Rút khẩn cấp" : "Rút về tài khoản chính"));
      draft.customer.mainCasaBalance += action.amount;
      if (goal.reachedEarlyAt && goalValue(draft, goal).total < goal.targetAmount) goal.reachedEarlyAt = undefined;
      toast(draft, `Đã rút ${formatVnd(action.amount)} về tài khoản chính.`);
      return draft;
    }

    case "setStandingOrder": {
      const goal = findGoal(draft, action.goalId);
      if (!goal) return fail(state, "Không tìm thấy mục tiêu.");
      const day = Math.min(28, Math.max(1, Math.round(action.dayOfMonth)));
      const active = action.active ?? true;
      goal.standingOrder = {
        amount: action.amount,
        dayOfMonth: day,
        active,
        nextRunDate: nextDayOfMonth(today, day),
        lastRunDate: goal.standingOrder?.lastRunDate,
        lastResult: goal.standingOrder?.lastResult,
        failedCount: 0,
      };
      toast(
        draft,
        active ? `Trích tự động ${formatVnd(action.amount)} vào ngày ${day} hằng tháng.` : "Đã tạm dừng trích tự động.",
      );
      return draft;
    }

    case "runStandingOrderNow": {
      const result = runStandingOrder(draft, action.goalId, today);
      if (result === "skipped") return fail(state, "Chưa có lệnh trích tự động đang bật.");
      lifecycle(draft);
      if (result === "ok") toast(draft, "Đã trích thành công.");
      else toast(draft, "Trích không thành công: tài khoản chính không đủ số dư.", "error");
      return draft;
    }

    case "addFixedAsset": {
      const goal = findGoal(draft, action.goalId);
      if (!goal) return fail(state, "Không tìm thấy mục tiêu.");
      draft.assets.push(
        makeAsset(
          draft,
          goal.id,
          {
            type: "fixed",
            name: action.name,
            category: action.category,
            value: action.value,
            valuationDate: action.valuationDate ?? today,
            countPercent: action.countPercent,
            source: action.source,
          },
          today,
        ),
      );
      lifecycle(draft);
      toast(draft, `Đã thêm tài sản “${action.name}”.`);
      return draft;
    }

    case "revalueAsset": {
      const asset = draft.assets.find((a) => a.id === action.assetId);
      if (!asset || asset.type !== "fixed") return fail(state, "Chỉ định giá lại được tài sản cố định.");
      asset.value = action.value;
      asset.valuationDate = action.valuationDate ?? today;
      if (action.countPercent !== undefined) asset.countPercent = action.countPercent;
      asset.source = "self_reported";
      lifecycle(draft);
      toast(draft, `Đã cập nhật giá trị “${asset.name}”.`);
      return draft;
    }

    case "removeAsset": {
      const asset = draft.assets.find((a) => a.id === action.assetId);
      if (!asset) return state;
      if (asset.type === "liquid" && asset.status !== "sold") return fail(state, "Hãy bán tài sản linh hoạt để đưa tiền về tài khoản mục tiêu.");
      draft.assets = draft.assets.filter((a) => a.id !== action.assetId);
      toast(draft, `Đã bỏ “${asset.name}” khỏi mục tiêu.`, "info");
      return draft;
    }

    case "invest": {
      const goal = findGoal(draft, action.goalId);
      const product = getInvestProduct(action.productId);
      if (!goal?.accountId || !product) return fail(state, "Không tìm thấy mục tiêu hoặc sản phẩm.");
      if (action.amount < product.minAmount) return fail(state, `Số tiền tối thiểu là ${formatVnd(product.minAmount)}.`);
      if (action.amount > goalBalance(draft, goal)) return fail(state, "Số dư tài khoản mục tiêu không đủ.");
      const asset = makeAsset(
        draft,
        goal.id,
        { type: "liquid", category: product.kind, productId: product.id, amount: action.amount, createdAt: today, termMonths: action.termMonths },
        today,
      );
      draft.assets.push(asset);
      postTxn(draft, goal, "invest", action.amount, today, `Đầu tư: ${asset.name}`);
      toast(draft, `Đã chuyển ${formatVnd(action.amount)} sang ${asset.name}.`);
      return draft;
    }

    case "sellAsset": {
      const asset = draft.assets.find((a) => a.id === action.assetId);
      const goal = asset ? findGoal(draft, asset.goalId) : undefined;
      if (!asset || !goal || asset.status === "sold") return fail(state, "Không tìm thấy tài sản.");
      if (asset.type === "liquid") {
        const fraction = Math.min(1, Math.max(0.01, action.fraction ?? 1));
        const proceeds = liquidate(draft, goal, asset, fraction);
        toast(draft, `Đã bán, ${formatVnd(proceeds)} về tài khoản mục tiêu.`);
      } else {
        const proceeds = Math.round(action.proceeds ?? asset.value);
        postTxn(draft, goal, "divest", proceeds, today, `Bán ${asset.name}`);
        asset.status = "sold";
        toast(draft, `Đã ghi nhận bán “${asset.name}”: ${formatVnd(proceeds)}.`);
      }
      lifecycle(draft);
      return draft;
    }

    case "handleMaturity": {
      const asset = draft.assets.find((a) => a.id === action.assetId);
      const goal = asset ? findGoal(draft, asset.goalId) : undefined;
      if (!asset || !goal || asset.type !== "liquid" || asset.category !== "term_deposit" || asset.principal === undefined) {
        return fail(state, "Không tìm thấy khoản tiền gửi.");
      }
      if (asset.status === "held" && (!asset.maturityDate || asset.maturityDate > today)) return fail(state, "Khoản tiền gửi chưa đến hạn.");
      const value = asset.principal + depositAccrued(asset.principal, asset.ratePa ?? 0, asset.createdAt, asset.maturityDate ?? today);
      if (action.choice === "toCash") {
        postTxn(draft, goal, "maturity", value, today, `${asset.name} đáo hạn`);
        asset.status = "sold";
        asset.value = value;
        toast(draft, `${formatVnd(value)} đã về tài khoản mục tiêu.`);
      } else {
        const product = getInvestProduct(asset.productId);
        const months = action.termMonths ?? asset.termMonths ?? 6;
        const term = product?.kind === "term_deposit" ? product.terms.find((t) => t.months === months) ?? product.terms[0] : undefined;
        asset.principal = value;
        asset.costBasis = value;
        asset.createdAt = today;
        asset.termMonths = term?.months ?? months;
        asset.ratePa = term?.ratePa ?? asset.ratePa;
        asset.maturityDate = addMonths(today, asset.termMonths);
        asset.status = "held";
        asset.valuationDate = today;
        asset.name = product ? `${product.name} ${asset.termMonths} tháng` : asset.name;
        asset.value = value;
        toast(draft, `Đã tái tục ${formatVnd(value)}, kỳ hạn ${asset.termMonths} tháng.`);
      }
      lifecycle(draft);
      return draft;
    }

    case "takeLoan": {
      const goal = findGoal(draft, action.goalId);
      const product = getLoanProduct(action.productId);
      if (!goal?.accountId || !product) return fail(state, "Không tìm thấy mục tiêu hoặc sản phẩm vay.");
      if (goal.loanId && draft.loans.some((l) => l.id === goal.loanId && l.status === "active")) return fail(state, "Mục tiêu đã có khoản vay.");
      const termMonths = Math.min(product.maxTermMonths, action.termMonths);
      const payment = annuityPayment(action.principal, product.ratePa, termMonths);
      const check = affordability({
        monthlyPayment: payment,
        monthlyIncome: draft.customer.monthlyIncome,
        existingDebtPayment: draft.customer.existingDebtPayment,
        ratePa: product.ratePa,
        termMonths,
      });
      if (!check.allowed) return fail(state, "Khoản trả hằng tháng vượt 40% thu nhập — không thể vay.");
      const loanId = nextId(draft, "loan");
      const loan = {
        id: loanId,
        goalId: goal.id,
        productId: product.id,
        principal: action.principal,
        ratePa: product.ratePa,
        termMonths,
        disbursedAt: today,
        monthlyPayment: payment,
        schedule: buildSchedule(action.principal, product.ratePa, termMonths, today),
        prepaid: 0,
        status: "active" as const,
      };
      refreshLoanStatuses(loan, today);
      draft.loans.push(loan);
      goal.loanId = loanId;
      for (const asset of draft.assets) {
        if (asset.goalId === goal.id && asset.type === "liquid" && asset.status !== "sold") liquidate(draft, goal, asset);
      }
      postTxn(draft, goal, "loan_disbursement", action.principal, today, `Giải ngân ${product.name}`);
      if (action.payForGoal ?? true) {
        postTxn(draft, goal, "withdraw", goalBalance(draft, goal), today, `Thanh toán “${goal.name}”`);
      }
      goal.status = "achieved";
      goal.achievedAt = today;
      toast(draft, `Đã giải ngân ${formatVnd(action.principal)}. “${goal.name}” đã Đạt mục tiêu!`);
      return draft;
    }

    case "startRepayment": {
      const goal = findGoal(draft, action.goalId);
      if (!goal || goal.status !== "achieved") return fail(state, "Mục tiêu chưa ở trạng thái Đạt mục tiêu.");
      goal.status = "repaying";
      toast(draft, "Bắt đầu giai đoạn Tích luỹ & trả nợ.", "info");
      return draft;
    }

    case "repay": {
      const loan = draft.loans.find((l) => l.id === action.loanId);
      const goal = loan ? findGoal(draft, loan.goalId) : undefined;
      if (!loan || !goal || loan.status !== "active") return fail(state, "Không tìm thấy khoản vay đang hoạt động.");
      const row = loan.schedule.find((r) => r.status !== "paid");
      if (!row) return fail(state, "Không còn kỳ nào cần trả.");
      if (goalBalance(draft, goal) < row.payment) return fail(state, "Tài khoản mục tiêu không đủ tiền để trả kỳ này.");
      postTxn(draft, goal, "loan_repayment", row.payment, today, `Trả nợ kỳ ${row.period}`);
      row.status = "paid";
      row.paidAt = today;
      refreshLoanStatuses(loan, today);
      lifecycle(draft);
      toast(draft, `Đã trả kỳ ${row.period}: ${formatVnd(row.payment)}.`);
      return draft;
    }

    case "prepay": {
      const loan = draft.loans.find((l) => l.id === action.loanId);
      const goal = loan ? findGoal(draft, loan.goalId) : undefined;
      if (!loan || !goal || loan.status !== "active") return fail(state, "Không tìm thấy khoản vay đang hoạt động.");
      if (loan.schedule.some((r) => r.status === "overdue")) return fail(state, "Hãy trả kỳ quá hạn trước khi trả trước.");
      const outstanding = outstandingPrincipal(loan.schedule);
      const amount = Math.min(action.amount, outstanding);
      if (amount <= 0) return fail(state, "Số tiền trả trước không hợp lệ.");
      if (amount > goalBalance(draft, goal)) return fail(state, "Tài khoản mục tiêu không đủ tiền.");
      postTxn(draft, goal, "loan_repayment", amount, today, "Trả trước nợ gốc");
      loan.prepaid += amount;
      const paid = loan.schedule.filter((r) => r.status === "paid");
      const unpaid = loan.schedule.filter((r) => r.status !== "paid");
      const left = outstanding - amount;
      if (left <= 0 || unpaid.length === 0) {
        for (const r of unpaid) {
          r.status = "paid";
          r.paidAt = today;
          r.principal = 0;
          r.interest = 0;
          r.payment = 0;
          r.remaining = 0;
        }
        loan.status = "paid_off";
      } else {
        const start = addMonths(unpaid[0].dueDate, -1);
        loan.schedule = [...paid, ...buildSchedule(left, loan.ratePa, unpaid.length, start, unpaid[0].period)];
        loan.monthlyPayment = annuityPayment(left, loan.ratePa, unpaid.length);
        refreshLoanStatuses(loan, today);
      }
      lifecycle(draft);
      toast(draft, `Đã trả trước ${formatVnd(amount)}. ${loan.status === "paid_off" ? "Khoản vay đã tất toán." : `Kỳ trả mới: ${formatVnd(loan.monthlyPayment)}/tháng.`}`);
      return draft;
    }

    case "completeEarly": {
      const goal = findGoal(draft, action.goalId);
      if (!goal || goal.status !== "accumulating") return fail(state, "Mục tiêu không ở trạng thái đang tích luỹ.");
      const value = goalValue(draft, goal).total;
      if (value < goal.targetAmount) return fail(state, "Mục tiêu chưa đủ tiền.");
      goal.status = "completed";
      goal.completedAt = today;
      goal.completedEarly = today < goal.targetDate;
      goal.finalValue = value;
      if (goal.standingOrder) goal.standingOrder.active = false;
      toast(draft, `Chúc mừng! “${goal.name}” đã hoàn thành.`);
      return draft;
    }

    case "extend": {
      const goal = findGoal(draft, action.goalId);
      if (!goal) return fail(state, "Không tìm thấy mục tiêu.");
      if (action.newTargetDate <= today) return fail(state, "Ngày mới phải sau hôm nay.");
      goal.originalTargetDate ??= goal.targetDate;
      goal.targetDate = action.newTargetDate;
      if (goal.status === "missed") goal.status = "accumulating";
      if (goal.standingOrder && goal.status === "accumulating") goal.standingOrder.active = true;
      toast(draft, `Đã lùi ngày mục tiêu sang ${action.newTargetDate.split("-").reverse().join("/")}.`);
      return draft;
    }

    case "reduceTarget": {
      const goal = findGoal(draft, action.goalId);
      if (!goal) return fail(state, "Không tìm thấy mục tiêu.");
      if (action.newTargetAmount <= 0) return fail(state, "Số tiền mục tiêu không hợp lệ.");
      goal.originalTargetAmount ??= goal.targetAmount;
      goal.targetAmount = action.newTargetAmount;
      const value = goalValue(draft, goal).total;
      if (goal.status === "missed") {
        if (value >= goal.targetAmount) {
          goal.status = "completed";
          goal.completedAt = today;
          goal.finalValue = value;
        } else {
          goal.status = "accumulating";
        }
      }
      lifecycle(draft);
      toast(draft, `Mục tiêu mới: ${formatVnd(action.newTargetAmount)}.`);
      return draft;
    }

    case "pauseGoal": {
      const goal = findGoal(draft, action.goalId);
      if (!goal || (goal.status !== "accumulating" && goal.status !== "repaying")) return fail(state, "Không thể tạm dừng mục tiêu này.");
      goal.pausedFrom = goal.status;
      goal.status = "paused";
      if (goal.standingOrder) goal.standingOrder.active = false;
      toast(draft, `Đã tạm dừng “${goal.name}”.`, "info");
      return draft;
    }

    case "resumeGoal": {
      const goal = findGoal(draft, action.goalId);
      if (!goal || goal.status !== "paused") return fail(state, "Mục tiêu không ở trạng thái tạm dừng.");
      goal.status = goal.pausedFrom ?? "accumulating";
      goal.pausedFrom = undefined;
      if (goal.standingOrder) {
        goal.standingOrder.active = true;
        goal.standingOrder.nextRunDate = nextDayOfMonth(today, goal.standingOrder.dayOfMonth);
      }
      lifecycle(draft);
      toast(draft, `Đã tiếp tục “${goal.name}”.`);
      return draft;
    }

    case "closeGoal": {
      const goal = findGoal(draft, action.goalId);
      if (!goal) return fail(state, "Không tìm thấy mục tiêu.");
      if (goal.loanId && draft.loans.some((l) => l.id === goal.loanId && l.status === "active")) {
        return fail(state, "Còn khoản vay chưa trả hết — chưa thể đóng mục tiêu.");
      }
      goal.finalValue = goalValue(draft, goal).total;
      for (const asset of draft.assets) {
        if (asset.goalId === goal.id && asset.type === "liquid" && asset.status !== "sold") liquidate(draft, goal, asset);
      }
      const cash = goalBalance(draft, goal);
      if (cash > 0) {
        postTxn(draft, goal, "withdraw", cash, today, "Đóng mục tiêu — chuyển về tài khoản chính");
        draft.customer.mainCasaBalance += cash;
      }
      const account = draft.accounts.find((a) => a.id === goal.accountId);
      if (account) account.status = "closed";
      if (goal.standingOrder) goal.standingOrder.active = false;
      if (goal.status !== "completed") goal.status = "closed";
      goal.closedAt = today;
      toast(draft, `Đã đóng “${goal.name}”${cash > 0 ? `, ${formatVnd(cash)} về tài khoản chính` : ""}.`, "info");
      return draft;
    }

    case "reorderPriorities": {
      const order = action.goalIds;
      const rest = draft.goals.filter((g) => !order.includes(g.id)).sort((a, b) => a.priority - b.priority);
      [...order.map((id) => findGoal(draft, id)).filter((g): g is Goal => !!g), ...rest].forEach((g, i) => {
        g.priority = i + 1;
      });
      toast(draft, "Đã cập nhật thứ tự ưu tiên.");
      return draft;
    }

    default:
      return state;
  }
}

function triggerEvent(state: PreviewState, draft: PreviewState, event: SimEvent, goalId?: string): PreviewState {
  const today = draft.clock.today;
  switch (event) {
    case "salary": {
      applySalary(draft);
      payDueInstalments(draft, today);
      toast(draft, `Lương về: +${formatVnd(draft.customer.monthlyIncome)} (sau chi tiêu còn ${formatVnd(draft.customer.mainCasaBalance)}).`, "info");
      return draft;
    }
    case "bigExpense": {
      const amount = 12_000_000;
      draft.customer.mainCasaBalance = Math.max(0, draft.customer.mainCasaBalance - amount);
      toast(draft, `Chi tiêu lớn: -${formatVnd(amount)} từ tài khoản chính.`, "warning");
      return draft;
    }
    case "standingOrderFail": {
      const goal =
        findGoal(draft, goalId) ?? draft.goals.find((g) => g.standingOrder?.active && (g.status === "accumulating" || g.status === "repaying"));
      if (!goal?.standingOrder) return fail(state, "Không có mục tiêu nào đang bật trích tự động.");
      draft.customer.mainCasaBalance = Math.min(draft.customer.mainCasaBalance, Math.max(0, goal.standingOrder.amount - 1_000_000));
      const wasActive = goal.standingOrder.active;
      goal.standingOrder.active = true;
      runStandingOrder(draft, goal.id, today);
      goal.standingOrder.active = wasActive;
      toast(draft, `Trích tự động cho “${goal.name}” không thành công: tài khoản chính không đủ số dư.`, "error");
      return draft;
    }
    case "overdue": {
      const loan =
        draft.loans.find((l) => l.status === "active" && (!goalId || l.goalId === goalId)) ?? undefined;
      if (!loan) return fail(state, "Không có khoản vay nào đang hoạt động.");
      const row = loan.schedule.find((r) => r.status !== "paid");
      if (!row) return fail(state, "Khoản vay không còn kỳ nào.");
      if (daysBetween(today, row.dueDate) > 0) row.dueDate = today;
      row.status = "overdue";
      refreshLoanStatuses(loan, today);
      toast(draft, `Kỳ ${row.period} (${formatVnd(row.payment)}) đã quá hạn.`, "error");
      return draft;
    }
  }
}
