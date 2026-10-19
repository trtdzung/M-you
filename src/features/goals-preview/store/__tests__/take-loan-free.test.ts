import { describe, expect, it } from "vitest";
import { goalEmoji } from "../../model/labels";
import { advanceTime } from "../../engine/advance";
import { goalStage, investableCash, investSuggestions, phaseOneResult } from "../../engine";
import { previewReducer, stateFromScenario } from "../reducer";

describe("takeLoan không còn bị chặn bởi 40% thu nhập hay trạng thái mục tiêu", () => {
  it("nhà 5 tỷ mới tích luỹ 12%: vẫn tạo được khoản vay và mục tiêu sang giai đoạn trả nợ", () => {
    const state = stateFromScenario("s13-loan-blocked");
    const goal = state.goals[0];
    expect(goal.status).toBe("accumulating");
    const next = previewReducer(state, { type: "takeLoan", goalId: goal.id, productId: "msb-loan-house", principal: 4_400_000_000, termMonths: 240 });
    const after = next.goals.find((g) => g.id === goal.id)!;
    expect(next.toasts.some((t) => t.tone === "error")).toBe(false);
    expect(after.loanId).toBeTruthy();
    expect(after.status).toBe("repaying");
    expect(next.loans.find((l) => l.id === after.loanId)?.principal).toBe(4_400_000_000);
  });

  it("tài sản của mục tiêu biến mất, tiền mặt rút để mua tài sản mục tiêu", () => {
    const state = stateFromScenario("s13-loan-blocked");
    const goal = state.goals[0];
    const account = state.accounts.find((a) => a.id === goal.accountId)!;
    const cash = account.balance;
    const main = state.customer.mainCasaBalance;
    const next = previewReducer(state, { type: "takeLoan", goalId: goal.id, productId: "msb-loan-house", principal: 4_400_000_000, termMonths: 240 });
    expect(next.customer.mainCasaBalance).toBe(main);
    const bought = next.assets.filter((a) => a.goalId === goal.id);
    expect(bought).toHaveLength(1);
    expect(bought[0]).toMatchObject({ type: "declared", name: goal.name, countPercent: 0 });
    expect(next.txns.some((t) => t.goalId === goal.id && t.kind === "withdraw" && t.note === `Mua tài sản: ${goal.name}`)).toBe(true);
    expect(next.accounts.find((a) => a.id === goal.accountId)!.balance).toBe(0);
    expect(phaseOneResult(next, next.goals.find((g) => g.id === goal.id)!)?.saved).toBe(cash);
  });
});

describe("giai đoạn 2: mục tiêu là gốc + lãi", () => {
  it("target bằng tổng các kỳ trả và tăng tiến độ khi trả kỳ", () => {
    let state = stateFromScenario("s13-loan-blocked");
    const goal = state.goals[0];
    state = previewReducer(state, { type: "takeLoan", goalId: goal.id, productId: "msb-loan-house", principal: 1_000_000_000, termMonths: 120 });
    const loan = state.loans[state.loans.length - 1];
    const total = loan.schedule.reduce((sum, r) => sum + r.payment, 0);
    const stage = goalStage(state, state.goals.find((g) => g.id === goal.id)!);
    expect(stage.phase).toBe(2);
    expect(stage.target).toBeCloseTo(total, 0);
    expect(stage.target).toBeGreaterThan(loan.principal);
    expect(stage.repaid).toBe(0);
  });
});

describe("đầu tư sản phẩm MSB", () => {
  it("khoản đầu tư thành tài sản linh hoạt có nguồn MSB", () => {
    const state = stateFromScenario("s01-car-feasible");
    const goal = state.goals.find((g) => g.accountId)!;
    const next = previewReducer(state, { type: "invest", goalId: goal.id, productId: "msb-savings-flex", amount: 1_000_000 });
    const added = next.assets.filter((a) => !state.assets.some((b) => b.id === a.id));
    expect(next.toasts.some((t) => t.tone === "error")).toBe(false);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: "msb", goalId: goal.id, source: "msb", status: "held" });
  });
});

describe("sang giai đoạn vay: tất toán đầu tư MSB", () => {
  const withInvestment = () => {
    let state = stateFromScenario("s13-loan-blocked");
    const goal = state.goals[0];
    state = previewReducer(state, { type: "invest", goalId: goal.id, productId: "msb-savings-flex", amount: 10_000_000 });
    return { state, goal };
  };
  const loan = (state: ReturnType<typeof stateFromScenario>, goalId: string, settlement: "now" | "next") =>
    previewReducer(state, { type: "takeLoan", goalId, productId: "msb-loan-house", principal: 1_000_000_000, termMonths: 120, settlement });

  it("tất toán ngay: rút toàn bộ giá trị hiện tại về tài khoản chính", () => {
    const { state, goal } = withInvestment();
    const inv = state.assets.find((a) => a.goalId === goal.id && a.type === "msb")!;
    const main = state.customer.mainCasaBalance;
    const cash = state.accounts.find((a) => a.id === goal.accountId)!.balance;
    const next = loan(state, goal.id, "now");
    expect(next.customer.mainCasaBalance).toBe(main + inv.value);
    expect(next.assets.some((a) => a.id === inv.id)).toBe(false);
    expect(next.accounts.find((a) => a.id === goal.accountId)!.balance).toBe(0);
    expect(cash).toBeGreaterThan(0);
  });

  it("tất toán kỳ tới: giữ khoản đầu tư, đến ngày hẹn rút về tài khoản chính", () => {
    const { state, goal } = withInvestment();
    const inv = state.assets.find((a) => a.goalId === goal.id && a.type === "msb")!;
    const main = state.customer.mainCasaBalance;
    const next = loan(state, goal.id, "next");
    const kept = next.assets.find((a) => a.id === inv.id);
    expect(kept).toMatchObject({ status: "held", countPercent: 0 });
    expect(kept && kept.type === "msb" && kept.settleOn).toBeTruthy();
    expect(next.customer.mainCasaBalance).toBe(main);
    const later = advanceTime(next, 45).state;
    expect(later.assets.find((a) => a.id === inv.id)?.status).toBe("sold");
    expect(later.customer.mainCasaBalance).toBeGreaterThan(main);
  });
});

describe("đầu tư không bị chặn bởi tiền nhàn rỗi", () => {
  it("gợi ý và số tiền tối đa theo toàn bộ số dư, luôn có ít nhất một sản phẩm", () => {
    const state = stateFromScenario("s13-loan-blocked");
    const goal = state.goals[0];
    const balance = state.accounts.find((a) => a.id === goal.accountId)!.balance;
    expect(investableCash(state, goal)).toBe(Math.floor(balance));
    expect(investSuggestions(state, goal, investableCash(state, goal)).length).toBeGreaterThan(0);
    expect(investSuggestions(state, goal, 1_000_000).length).toBeGreaterThan(0);
  });
});

describe("tạo mục tiêu không còn bản nháp", () => {
  it("createGoal tạo mục tiêu, mở tài khoản, nạp ban đầu và bật trích tự động trong một bước", () => {
    const state = stateFromScenario("empty");
    const main = state.customer.mainCasaBalance;
    const next = previewReducer(state, {
      type: "createGoal",
      input: {
        name: "Mua xe",
        template: "car",
        targetAmount: 500_000_000,
        targetDate: "2030-01-01",
        flexibility: "date_flexible",
        initialDeposit: 1_000_000,
        standingOrder: { amount: 2_000_000, dayOfMonth: 5 },
      },
    });
    const goal = next.goals.find((g) => g.id === next.lastCreatedGoalId)!;
    expect(goal).toMatchObject({ status: "accumulating", flexibility: "date_flexible" });
    expect(goal.accountId).toBeTruthy();
    expect(next.accounts.find((a) => a.id === goal.accountId)!.balance).toBe(1_000_000);
    expect(next.customer.mainCasaBalance).toBe(main - 1_000_000);
    expect(goal.standingOrder).toMatchObject({ amount: 2_000_000, dayOfMonth: 5, active: true });
  });

  it("nạp ban đầu vượt số dư tài khoản chính thì không tạo gì", () => {
    const state = stateFromScenario("empty");
    const next = previewReducer(state, {
      type: "createGoal",
      input: { name: "X", template: "other", targetAmount: 10_000_000, targetDate: "2030-01-01", flexibility: "date_flexible", initialDeposit: state.customer.mainCasaBalance + 1 },
    });
    expect(next.goals).toHaveLength(state.goals.length);
    expect(next.toasts.some((t) => t.tone === "error")).toBe(true);
  });
});

describe("thêm tài sản có sẵn khi tạo mục tiêu", () => {
  const house = { name: "Căn hộ Q7", category: "house" as const, value: 2_000_000_000, countPercent: 50 };

  it("createGoal gắn tài sản và tính vào giá trị mục tiêu", () => {
    const state = stateFromScenario("empty");
    const next = previewReducer(state, {
      type: "createGoal",
      input: { name: "Mua nhà", template: "house", targetAmount: 3_000_000_000, targetDate: "2032-01-01", flexibility: "date_flexible", assets: [house] },
    });
    const goal = next.goals.find((g) => g.id === next.lastCreatedGoalId)!;
    const attached = next.assets.filter((a) => a.goalId === goal.id);
    expect(attached).toHaveLength(1);
    expect(attached[0]).toMatchObject({ type: "declared", name: "Căn hộ Q7", countPercent: 50 });
    expect(goalStage(next, goal).value).toBe(1_000_000_000);
  });

  it("nav/popWith trả kết quả cho màn trước", () => {
    let state = stateFromScenario("empty");
    state = previewReducer(state, { type: "nav/push", screen: "GoalInfo", params: { name: "x" } });
    state = previewReducer(state, { type: "nav/push", screen: "AddAsset", params: { wizard: "1" } });
    state = previewReducer(state, { type: "nav/popWith", params: { assets: "[]" } });
    expect(state.nav.stack.at(-1)).toMatchObject({ screen: "GoalInfo", params: { name: "x", assets: "[]" } });
  });
});

describe("logo của mục tiêu tuỳ chỉnh", () => {
  it("createGoal lưu logo khách chọn và goalEmoji dùng logo đó", () => {
    const state = stateFromScenario("empty");
    const next = previewReducer(state, {
      type: "createGoal",
      input: { name: "Nuôi mèo", template: "other", targetAmount: 20_000_000, targetDate: "2030-01-01", flexibility: "date_flexible", icon: "wedding" },
    });
    const goal = next.goals.find((g) => g.id === next.lastCreatedGoalId)!;
    expect(goal.icon).toBe("wedding");
    expect(goalEmoji(goal)).toBe("💍");
    expect(goalEmoji({ template: "car" })).toBe("🚗");
  });
});

describe("chỉnh sửa giá trị mục tiêu sau khi tạo", () => {
  it("đổi được giá trị mục tiêu lên hoặc xuống, từ chối giá trị không hợp lệ", () => {
    const state = stateFromScenario("s13-loan-blocked");
    const goal = state.goals[0];
    const up = previewReducer(state, { type: "reduceTarget", goalId: goal.id, newTargetAmount: goal.targetAmount + 500_000_000 });
    expect(up.goals[0].targetAmount).toBe(goal.targetAmount + 500_000_000);
    const down = previewReducer(state, { type: "reduceTarget", goalId: goal.id, newTargetAmount: 2_000_000_000 });
    expect(down.goals[0].targetAmount).toBe(2_000_000_000);
    const bad = previewReducer(state, { type: "reduceTarget", goalId: goal.id, newTargetAmount: 0 });
    expect(bad.goals[0].targetAmount).toBe(goal.targetAmount);
    expect(bad.toasts.some((t) => t.tone === "error")).toBe(true);
  });
});
