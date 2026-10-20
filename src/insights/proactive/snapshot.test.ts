import { describe, expect, it } from "vitest";
import {
  buildCustomerSnapshot,
  selectDiverseTopCandidates,
  selectTop3DiverseCandidates,
  selectOrderedHomeCandidates,
  type SnapshotOverlay,
} from "./snapshot";
import type { RawData } from "@/domain/engine/finance-compose";
import { generateDataset } from "@/providers/mock/fixtures/generate";
import { PERSONA_LIST } from "@/providers/mock/personas";
import type { JarConfig, Transaction } from "@/domain/models";
import { REBALANCE_CATEGORY } from "@/domain/models";
import { validAgentSelection } from "./home-contract";
const now = new Date("2026-09-15T00:00:00Z");
const profile: SnapshotOverlay = { assets: [], liabilities: [], goals: [], complete: true };
const noJars: JarConfig = { version: 3, jars: [] };
function raw(): RawData {
  const seed = generateDataset(PERSONA_LIST[0]);
  return { ...seed, transactions: [], liabilities: [], goals: [], budgets: [], snapshots: [] };
}
function txn(id: string, amount: number, postedAt = "2026-09-15T01:00:00Z", over: Partial<Transaction> = {}): Transaction {
  return { id, accountId: "a", postedAt, amount, currency: "VND", direction: "debit", type: "expense",
    categoryId: "dining", merchantName: "Cafe", merchantNormalizedName: "cafe", status: "posted", source: "mock",
    isRecurring: false, userEdited: false, ...over };
}
const make = (r = raw(), p = profile, j = noJars, topups: Transaction[] = []) => buildCustomerSnapshot(r, j, [], p, topups, now);

describe("financial snapshot", () => {
  it("uses VN calendar, excludes future/pending/transfers and nets refunds", () => {
    const s = make({ ...raw(), transactions: [txn("today", 100, "2026-09-14T18:00:00Z"),
      txn("refund", 20, undefined, { type: "refund", direction: "credit" }),
      txn("future", 1000, "2026-09-15T18:00:00Z"), txn("pending", 300, undefined, { status: "pending" }),
      txn("transfer", 400, undefined, { type: "transfer" })] });
    expect(s.cashflow.today.expense).toBe(80);
    expect(s.transactions.some((t) => t.id === "future")).toBe(false);
    expect(JSON.stringify(s.accounts)).not.toMatch(/maskedNumber|accountNumber/);
  });
  it("keeps full aggregates when detailed transaction rows are capped", () => {
    const s = make({ ...raw(), transactions: Array.from({ length: 501 }, (_, i) => txn(`${i}`, 100)) });
    expect(s.transactions).toHaveLength(500);
    expect(s.dataQuality.transactionRowsTruncated).toBe(true);
    expect(s.cashflow.today.expense).toBe(50100);
  });
  it("prioritizes known minimum payments and leaves unknown amounts unknown", () => {
    const base = PERSONA_LIST.flatMap((p) => p.liabilities)[0];
    const s = make({ ...raw(), liabilities: [{ ...base, id: "later", dueDate: "2026-09-22", minimumPayment: 300000 },
      { ...base, id: "first", dueDate: "2026-09-16", minimumPayment: 200000 },
      { ...base, id: "unknown", dueDate: "2026-09-16", minimumPayment: null }] });
    expect(s.candidates[0]).toMatchObject({ id: "payment:next7", metric: { value: 500000 }, facts: { nearest_due: "2026-09-16" } });
    expect(s.payments.find((p) => p.id === "unknown")?.amount).toBeNull();
    expect(s.candidates.some((c) => c.topic === "investment")).toBe(false);
  });
  it("compares month spending against the same elapsed days", () => {
    const s = make({ ...raw(), transactions: [txn("cur", 1000000), txn("prev", 400000, "2026-08-15T00:00:00Z"),
      txn("late", 9000000, "2026-08-20T00:00:00Z")] });
    expect(s.cashflow.previousComparable.expense).toBe(400000);
    expect(s.candidates.some((c) => c.id === "spending:month")).toBe(true);
  });
  it("session topup reduces pool and raises jar balance without adding spending", () => {
    const anchor = "2026-09-01T00:00:00Z";
    const j: JarConfig = { version: 3,
      jars: [{ id: "food", label: "Food", categoryIds: ["dining"], budgetLimit: 1000000, createdAt: anchor }],
      ledger: [{ id: "open-food", jarId: "food", kind: "deposit", amount: 1000000, isOpening: true, createdAt: anchor, source: "self_reported" }] };
    const r = { ...raw(), transactions: [txn("spent", 900000)] };
    const before = make(r, profile, j);
    const after = make(r, profile, j, [txn("topup", 200000, undefined, { type: "transfer", categoryId: REBALANCE_CATEGORY,
      rebalance: { fromJarId: "pool", toJarId: "food", origin: "manual", triggerTxnId: "x" } })]);
    expect(after.jars[0].balance).toBe((before.jars[0].balance ?? 0) + 200000);
    expect(after.cashflow.monthToDate.expense).toBe(before.cashflow.monthToDate.expense);
    expect(after.unallocated.amount).toBe((before.unallocated.amount as number) - 200000);
  });
  it("only offers investment discovery with conservative reserves and complete profile", () => {
    const r = raw();
    r.accounts = r.accounts.filter((a) => a.type === "current").map((a) => ({ ...a, balance: 100000000, availableBalance: 100000000 }));
    r.transactions = [txn("prev", 1000000, "2026-08-01T00:00:00Z")];
    expect(make(r).candidates.some((c) => c.topic === "investment")).toBe(true);
    expect(make(r, { ...profile, complete: false }).candidates.some((c) => c.topic === "investment")).toBe(false);
    expect(make(r, { ...profile, goals: [{ id: "goal", name: "House", targetAmount: 100000000,
      currentAmount: 0, targetDate: null, source: "self_reported" }] }).candidates.some((c) => c.topic === "investment")).toBe(false);
  });
  it("differentiates jar pressure states: needs_cover (urgent), over_limit_covered, and near_limit", () => {
    const anchor = "2026-09-01T00:00:00Z";
    // 1. Jar with negative balance -> needs_cover (urgent)
    const j1: JarConfig = {
      version: 3,
      jars: [{ id: "dining_jar", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 1000000, createdAt: anchor }],
      ledger: [{ id: "open-1", jarId: "dining_jar", kind: "deposit", amount: 500000, isOpening: true, createdAt: anchor, source: "self_reported" }],
    };
    // Spent 700k against 500k deposit -> balance = -200k
    const s1 = make({ ...raw(), transactions: [txn("t1", 700000)] }, profile, j1);
    const c1 = s1.candidates.find((c) => c.id === "spending:jar:dining_jar");
    expect(c1).toBeDefined();
    expect(c1?.severity).toBe("urgent");
    expect(c1?.facts.semantic_state).toBe("needs_cover");
    expect(c1?.metric.label).toBe("Cần bù · Ăn uống");
    expect(c1?.metric.value).toBe(200000);
    expect(c1?.title).toContain("cần bù");

    // 2. Over limit with positive balance -> over_limit_covered (attention)
    const j2: JarConfig = {
      version: 3,
      jars: [{ id: "dining_jar", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 500000, createdAt: anchor }],
      ledger: [{ id: "open-2", jarId: "dining_jar", kind: "deposit", amount: 1000000, isOpening: true, createdAt: anchor, source: "self_reported" }],
    };
    // Spent 600k (exceeds 500k limit), but balance is 400k (> 0)
    const s2 = make({ ...raw(), transactions: [txn("t2", 600000)] }, profile, j2);
    const c2 = s2.candidates.find((c) => c.id === "spending:jar:dining_jar");
    expect(c2).toBeDefined();
    expect(c2?.severity).toBe("attention");
    expect(c2?.facts.semantic_state).toBe("over_limit_covered");
    expect(c2?.metric.label).toBe("Còn lại · Ăn uống");
    expect(c2?.metric.value).toBe(400000);
    expect(c2?.title).toContain("vượt hạn mức");

    // 3. Near limit: spent 85% of limit, positive balance -> near_limit (attention)
    const j3: JarConfig = {
      version: 3,
      jars: [{ id: "dining_jar", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 1000000, createdAt: anchor }],
      ledger: [{ id: "open-3", jarId: "dining_jar", kind: "deposit", amount: 1000000, isOpening: true, createdAt: anchor, source: "self_reported" }],
    };
    const s3 = make({ ...raw(), transactions: [txn("t3", 850000)] }, profile, j3);
    const c3 = s3.candidates.find((c) => c.id === "spending:jar:dining_jar");
    expect(c3).toBeDefined();
    expect(c3?.severity).toBe("attention");
    expect(c3?.facts.semantic_state).toBe("near_limit");
    expect(c3?.title).toContain("gần hạn mức");

    // 4. Jar without limit and positive balance -> does NOT trigger pressure
    const j4: JarConfig = {
      version: 3,
      jars: [{ id: "dining_jar", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: undefined, createdAt: anchor }],
      ledger: [{ id: "open-4", jarId: "dining_jar", kind: "deposit", amount: 1000000, isOpening: true, createdAt: anchor, source: "self_reported" }],
    };
    const s4 = make({ ...raw(), transactions: [txn("t4", 300000)] }, profile, j4);
    const c4 = s4.candidates.find((c) => c.id === "spending:jar:dining_jar");
    expect(c4).toBeUndefined();
  });
  it("generates a refund_received candidate when a posted refund occurs within recent window", () => {
    const s = make({
      ...raw(),
      transactions: [
        txn("ref-1", 150000, "2026-09-14T10:00:00Z", {
          type: "refund",
          direction: "credit",
          status: "posted",
          merchantName: "Shopee Refund",
          relatedTransactionId: "orig-1",
        }),
      ],
    });
    const refundCandidate = s.candidates.find((c) => c.id === "refund:ref-1");
    expect(refundCandidate).toBeDefined();
    expect(refundCandidate?.priority).toBe(3);
    expect(refundCandidate?.severity).toBe("info");
    expect(refundCandidate?.action).toBe("overview");
    expect(refundCandidate?.metric.value).toBe(150000);
    expect(refundCandidate?.facts.rule_id).toBe("refund_received");
    expect(refundCandidate?.facts.related_transaction_id).toBe("orig-1");
  });
  it("rejects unknown candidate, downgraded priority, invented numbers and stale snapshot", () => {
    const s = make();
    const candidate = s.candidates[0];
    const value = { candidate_id: candidate.id, snapshot_id: "hash", title: "Xem tiền chưa phân bổ", body: "Cùng chọn ưu tiên." };
    expect(validAgentSelection(value, "hash", s.candidates)).not.toBeNull();
    expect(validAgentSelection({ ...value, title: "Có 10 triệu" }, "hash", s.candidates)).toBeNull();
    expect(validAgentSelection(value, "stale", s.candidates)).toBeNull();
    expect(validAgentSelection({ ...value, candidate_id: "madeup" }, "hash", s.candidates)).toBeNull();
    expect(validAgentSelection(value, "hash", [...s.candidates, { ...candidate, id: "urgent", priority: 0 }])).toBeNull();
  });

  it("generates UPCOMING_OBLIGATION with deterministic impactLine matching CASA balance sufficiency", () => {
    const base = PERSONA_LIST.flatMap((p) => p.liabilities)[0];
    const rSufficient = raw();
    rSufficient.accounts = [{ id: "acc-1", type: "current", institution: "MSB", maskedNumber: "•••• 1234", accountNumber: "0123456789", currency: "VND", balance: 5000000, availableBalance: 5000000, source: "mock", lastSyncedAt: "2026-09-15T00:00:00Z" }];
    const s1 = make({ ...rSufficient, liabilities: [{ ...base, id: "loan-1", dueDate: "2026-09-18", minimumPayment: 2000000 }] });
    const c1 = s1.candidates.find((c) => c.id === "payment:next7");
    expect(c1).toBeDefined();
    expect(c1?.category).toBe("UPCOMING_OBLIGATION");
    expect(c1?.categoryLabel).toBe("Nghĩa vụ sắp đến hạn");
    expect(c1?.impactLine).toBe("Số dư hiện đủ trả.");
    expect(c1?.badgeText).toBe("Còn 3 ngày");
    expect(c1?.primaryAction?.type).toBe("navigate_transfer");

    // Case B: CASA shortfall
    const rShortfall = raw();
    rShortfall.accounts = [{ id: "acc-2", type: "current", institution: "MSB", maskedNumber: "•••• 5678", accountNumber: "9876543210", currency: "VND", balance: 500000, availableBalance: 500000, source: "mock", lastSyncedAt: "2026-09-15T00:00:00Z" }];
    const s2 = make({ ...rShortfall, liabilities: [{ ...base, id: "loan-2", dueDate: "2026-09-18", minimumPayment: 2000000 }] });
    const c2 = s2.candidates.find((c) => c.id === "payment:next7");
    expect(c2).toBeDefined();
    expect(c2?.impactLine).toContain("Số dư hiện thiếu khoảng 1,5 triệu để tất toán.");
  });

  it("generates PERIODIC_PULSE and security signals with SC3 and BT1", () => {
    const s = buildCustomerSnapshot(
      raw(),
      noJars,
      [],
      profile,
      [],
      now,
      { score: 70, hasEmergencyContact: false, hasActiveHold: true }
    );

    // Periodic pulse
    const pulse = s.candidates.find((c) => c.category === "PERIODIC_PULSE");
    expect(pulse).toBeDefined();
    expect(pulse?.categoryLabel).toBe("Nhịp tiền định kỳ");
    expect(pulse?.slotGroup).toBe("GROW_AND_GUIDE");

    // Security hold alert / SC3 (High priority RED)
    const hold = s.candidates.find((c) => c.id === "security:sc3_active_case");
    expect(hold).toBeDefined();
    expect(hold?.category).toBe("SECURITY_RED");
    expect(hold?.securityLevel).toBe("RED");
    expect(hold?.slotGroup).toBe("PROTECT");
    expect(hold?.tone).toBe("urgent");
    expect(hold?.actionType).toBe("view_fraud_case");

    // Security onboarding with score < 80 (BT1 GREEN)
    const sGuide = buildCustomerSnapshot(
      raw(),
      noJars,
      [],
      profile,
      [],
      now,
      { score: 45, hasEmergencyContact: true, hasActiveHold: false }
    );
    const guide = sGuide.candidates.find((c) => c.id === "security:bt1_onboarding");
    expect(guide).toBeDefined();
    expect(guide?.category).toBe("SECURITY_GREEN");
    expect(guide?.securityLevel).toBe("GREEN");
    expect(guide?.metric.unit).toBe("points");
    expect(guide?.metric.value).toBe(45);
    expect(guide?.badgeText).toBe("Bảo mật");
  });

  it("slot diversity algorithm selects distinct categories for Slide 2 and Slide 3", () => {
    const dummyCandidate = (id: string, priority: number, category: any, slotGroup: any): any => ({
      id,
      priority,
      category,
      slotGroup,
      metric: { label: "Test", value: 100, unit: "VND" },
      facts: {},
    });

    const candidates = [
      dummyCandidate("risk-1", 1, "CASHFLOW_RISK", "PROTECT"),
      dummyCandidate("risk-2", 1, "CASHFLOW_RISK", "PROTECT"),
      dummyCandidate("goal-1", 2, "GOAL_PROGRESS", "GROW_AND_GUIDE"),
      dummyCandidate("opt-1", 3, "OPTIMIZATION", "GROW_AND_GUIDE"),
    ];

    const chosen = selectDiverseTopCandidates(candidates);
    expect(chosen).toHaveLength(2);
    expect(chosen[0].id).toBe("risk-1");
    // Slide 3 should select GOAL_PROGRESS instead of second CASHFLOW_RISK
    expect(chosen[1].id).toBe("goal-1");
    expect(chosen[0].category).not.toBe(chosen[1].category);

    // Exception: 2 priority 0 candidates both stay
    const twoUrgent = [
      dummyCandidate("urgent-1", 0, "UPCOMING_OBLIGATION", "PROTECT"),
      dummyCandidate("urgent-2", 0, "UPCOMING_OBLIGATION", "PROTECT"),
      dummyCandidate("goal-2", 2, "GOAL_PROGRESS", "GROW_AND_GUIDE"),
    ];
    const chosenUrgent = selectDiverseTopCandidates(twoUrgent);
    expect(chosenUrgent[0].id).toBe("urgent-1");
    expect(chosenUrgent[1].id).toBe("urgent-2");
  });

  it("selectTop3DiverseCandidates selects 3 diverse candidates across 3 slides and fills fallback if < 3", () => {
    const dummyCandidate = (id: string, priority: number, category: any, slotGroup: any): any => ({
      id,
      priority,
      category,
      categoryLabel: category,
      slotGroup,
      metric: { label: "Test", value: 100, unit: "VND" },
      facts: {},
    });

    // Case 1: Rich candidate list
    const candidates = [
      dummyCandidate("obligation-1", 1, "UPCOMING_OBLIGATION", "PROTECT"),
      dummyCandidate("risk-1", 1, "CASHFLOW_RISK", "PROTECT"),
      dummyCandidate("pulse-1", 2, "PERIODIC_PULSE", "GROW_AND_GUIDE"),
      dummyCandidate("opt-1", 3, "OPTIMIZATION", "GROW_AND_GUIDE"),
    ];

    const top3 = selectTop3DiverseCandidates(candidates);
    expect(top3).toHaveLength(3);
    expect(top3[0].category).toBe("UPCOMING_OBLIGATION");
    expect(top3[1].category).toBe("PERIODIC_PULSE");
    expect(top3[2].category).toBe("OPTIMIZATION");

    // Case 2: Sparse candidate list (< 3 items) fills fallback to guarantee 3 slides
    const sparse = [dummyCandidate("single-risk", 1, "CASHFLOW_RISK", "PROTECT")];
    const filled = selectTop3DiverseCandidates(sparse);
    expect(filled).toHaveLength(3);
    expect(filled[0].id).toBe("single-risk");
    expect(filled[1].category).not.toBe("CASHFLOW_RISK");
    expect(filled[2].category).not.toBe("CASHFLOW_RISK");
    expect(filled[1].category).not.toBe(filled[2].category);
  });

  it("selectOrderedHomeCandidates orders [Security RED/AMBER] -> [PFM 1..3] -> [Security GREEN] and inserts fallback security:all_clear", () => {
    const dummy = (id: string, domain: any, priority: number, securityLevel?: any, category?: any): any => ({
      id,
      domain,
      priority,
      securityLevel,
      category: category ?? (domain === "SECURITY" ? `SECURITY_${securityLevel}` : "PERIODIC_PULSE"),
      metric: { label: "Test", value: 100, unit: "VND" },
      facts: {},
    });

    // Case 1: Candidates with RED, AMBER, GREEN and multiple PFM
    const candidates = [
      dummy("pfm-1", "PFM", 1, undefined, "UPCOMING_OBLIGATION"),
      dummy("sec-green", "SECURITY", 8, "GREEN"),
      dummy("pfm-2", "PFM", 2, undefined, "CASHFLOW_RISK"),
      dummy("sec-red", "SECURITY", 0, "RED"),
      dummy("sec-amber", "SECURITY", 1, "AMBER"),
      dummy("pfm-3", "PFM", 3, undefined, "GOAL_PROGRESS"),
    ];

    const ordered = selectOrderedHomeCandidates(candidates);
    expect(ordered.length).toBeLessThanOrEqual(5);
    expect(ordered.length).toBeGreaterThanOrEqual(2);

    // Order must be: [Security RED, AMBER] -> [PFM 1..3] -> [Security GREEN]
    expect(ordered[0].id).toBe("sec-red");
    expect(ordered[0].securityLevel).toBe("RED");
    expect(ordered[1].id).toBe("sec-amber");
    expect(ordered[1].securityLevel).toBe("AMBER");
    expect(ordered[2].domain).toBe("PFM");
    expect(ordered[3].domain).toBe("PFM");
    expect(ordered[4].domain).toBe("PFM");

    // Case 2: Only PFM candidates -> automatically includes fallback security:all_clear at the end
    const pfmOnly = [
      dummy("pfm-only-1", "PFM", 1, undefined, "UPCOMING_OBLIGATION"),
      dummy("pfm-only-2", "PFM", 2, undefined, "PERIODIC_PULSE"),
    ];
    const withFallbackSec = selectOrderedHomeCandidates(pfmOnly);
    expect(withFallbackSec.length).toBe(3);
    expect(withFallbackSec[0].domain).toBe("PFM");
    expect(withFallbackSec[1].domain).toBe("PFM");
    expect(withFallbackSec[2].id).toBe("security:all_clear");
    expect(withFallbackSec[2].securityLevel).toBe("GREEN");
  });
});
