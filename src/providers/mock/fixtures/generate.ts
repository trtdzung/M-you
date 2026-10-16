/**
 * Deterministic transaction + snapshot generator. Given a persona it produces
 * ~6 months of realistic VN transactions (recurring bills, discretionary spend,
 * internal transfers, a refund, a reversal, pending items) plus accounts and
 * net-worth snapshots. Income was removed — the ledger is spending-only. Seeded —
 * same persona always yields the same data.
 */

import type {
  Account,
  Asset,
  Budget,
  Goal,
  Liability,
  MockProduct,
  MonthlySnapshot,
  Transaction,
} from "@/domain/models";
import { CATEGORY, CURRENCY_VND, UNCLASSIFIED } from "@/domain/models";
import { maskAccountNumber } from "@/lib/format";
import type { PersonaMeta } from "../personas";
import { chance, jitter, mulberry32, pick, randInt, type Rng } from "../rng";

export interface Dataset {
  accounts: Account[];
  transactions: Transaction[];
  assets: Asset[];
  liabilities: Liability[];
  budgets: Budget[];
  goals: Goal[];
  snapshots: MonthlySnapshot[];
  products: MockProduct[];
}

/**
 * A past external P2P payee that is NOT a saved beneficiary — lets the assistant
 * resolve a recipient from real transaction history (with a real account number)
 * rather than fabricating one. Kept stable so history resolution is testable.
 */
const HISTORY_PAYEE = { name: "Phạm Thu Hà", norm: "pham thu ha", account: "0281000556677", bankName: "Techcombank" };

/** Anchor "today" for fixtures — keeps data stable regardless of wall clock. */
const ANCHOR_YEAR = 2026;
const ANCHOR_MONTH = 8; // 0-based September
const ANCHOR_DAY = 15; // current month only has data up to here
const MONTHS = 6;

/**
 * Fraction of discretionary spend the bank ships WITHOUT an enrichment label —
 * simulates real un-enriched data so the AI auto-categorization feature has a
 * genuine backfill target (Red Team #1). Deterministic via the seeded RNG: the
 * real merchant name/normalized-name is still recorded (the classifier's signal);
 * only `categoryId` becomes the `UNCLASSIFIED` sentinel.
 */
const UNCLASSIFIED_RATE = 0.18;

const MERCHANTS: Record<string, [string, string][]> = {
  [CATEGORY.groceries]: [["Bách hóa Xanh", "bach hoa xanh"], ["WinMart", "winmart"], ["Co.opmart", "coopmart"]],
  [CATEGORY.dining]: [["Highlands Coffee", "highlands"], ["Phở 24", "pho 24"], ["The Coffee House", "coffee house"], ["GrabFood", "grabfood"]],
  [CATEGORY.transport]: [["Grab", "grab"], ["Xăng Petrolimex", "petrolimex"], ["Be", "be"]],
  [CATEGORY.shopping]: [["Shopee", "shopee"], ["Uniqlo", "uniqlo"], ["Tiki", "tiki"], ["Lazada", "lazada"]],
  [CATEGORY.entertainment]: [["CGV Cinemas", "cgv"], ["Steam", "steam"], ["Karaoke Kingdom", "karaoke"]],
};

const SUBSCRIPTIONS: [string, string, number][] = [
  ["Netflix", "netflix", 260_000],
  ["Spotify", "spotify", 59_000],
  ["Phòng gym California", "gym california", 700_000],
];

function iso(year: number, month: number, day: number, hour = 10): string {
  return new Date(Date.UTC(year, month, day, hour)).toISOString();
}

/** The 6 target months, oldest first, as {year, month, cap(day)}. */
function months(): { year: number; month: number; cap: number; key: string }[] {
  const out: { year: number; month: number; cap: number; key: string }[] = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ANCHOR_YEAR, ANCHOR_MONTH - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const isCurrent = i === 0;
    out.push({
      year: y,
      month: m,
      cap: isCurrent ? ANCHOR_DAY : new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
      key: `${y}-${String(m + 1).padStart(2, "0")}`,
    });
  }
  return out;
}

export function generateDataset(meta: PersonaMeta): Dataset {
  const rng: Rng = mulberry32(meta.params.seed);
  const p = meta.params;
  const txns: Transaction[] = [];
  let seq = 0;

  const accCurrent = `acc_${meta.id}_current`;
  const accSavings = `acc_${meta.id}_savings`;
  const accCredit = `acc_${meta.id}_credit`;

  const add = (t: Omit<Transaction, "id" | "currency" | "source">): void => {
    txns.push({ id: `tx_${meta.id}_${String(seq++).padStart(4, "0")}`, currency: CURRENCY_VND, source: "mock", ...t });
  };
  const spend = (year: number, month: number, day: number, categoryId: string, base: number, status: Transaction["status"] = "posted", canBeUnclassified = false): Transaction["id"] => {
    // Pick the merchant from the REAL category so its name/norm stays a valid
    // classifier signal even when we drop the label below.
    const [name, norm] = pick(rng, MERCHANTS[categoryId] ?? [["Cửa hàng", "cua hang"]]);
    const id = `tx_${meta.id}_${String(seq).padStart(4, "0")}`;
    const unclassified = canBeUnclassified && status === "posted" && chance(rng, UNCLASSIFIED_RATE);
    add({ accountId: accCurrent, postedAt: iso(year, month, day), amount: jitter(rng, base, 0.35, 1000), direction: "debit", type: "expense", merchantName: name, merchantNormalizedName: norm, categoryId: unclassified ? UNCLASSIFIED : categoryId, status, isRecurring: false, userEdited: false });
    return id;
  };

  const monthList = months();
  monthList.forEach(({ year, month, cap }, mi) => {
    // Income was removed from the product — the ledger tracks spending only. The
    // CASA account balance (funded elsewhere) is the envelope/net-worth source.

    // Recurring fixed bills
    add({ accountId: accCurrent, postedAt: iso(year, month, 3), amount: jitter(rng, p.housingBase, 0.02, 100_000), direction: "debit", type: "expense", merchantName: "Chủ nhà / Vay nhà", merchantNormalizedName: "housing", categoryId: CATEGORY.housing, status: "posted", isRecurring: true, userEdited: false });
    add({ accountId: accCurrent, postedAt: iso(year, month, 10), amount: jitter(rng, 900_000, 0.25, 10_000), direction: "debit", type: "expense", merchantName: "EVN / Nước / Internet", merchantNormalizedName: "utilities", categoryId: CATEGORY.utilities, status: "posted", isRecurring: true, userEdited: false });
    if (cap >= 15) {
      for (const [name, norm, amt] of SUBSCRIPTIONS) {
        add({ accountId: accCurrent, postedAt: iso(year, month, 15), amount: amt, direction: "debit", type: "expense", merchantName: name, merchantNormalizedName: norm, categoryId: CATEGORY.subscriptions, status: "posted", isRecurring: true, userEdited: false });
      }
    }

    // Discretionary spend (scaled by persona)
    const scale = p.discretionaryScale;
    const lastShopId: string[] = [];
    const bursts: [string, number, number][] = [
      [CATEGORY.groceries, Math.round(randInt(rng, 4, 7)), 300_000],
      [CATEGORY.dining, Math.round(randInt(rng, 6, 11) * scale), 180_000],
      [CATEGORY.transport, Math.round(randInt(rng, 5, 9)), 90_000],
      [CATEGORY.shopping, Math.round(randInt(rng, 2, 4) * scale), 600_000],
      [CATEGORY.entertainment, Math.round(randInt(rng, 1, 3) * scale), 250_000],
    ];
    for (const [cat, count, base] of bursts) {
      for (let i = 0; i < count; i++) {
        // Discretionary spend may ship un-enriched (UNCLASSIFIED) — the AI
        // backfill target. Recurring bills stay labelled.
        const id = spend(year, month, randInt(rng, 1, cap), cat, base, "posted", true);
        if (cat === CATEGORY.shopping) lastShopId.push(id);
      }
    }

    // Internal transfer to savings (two legs, excluded from cashflow)
    const tg = `tg_${meta.id}_${mi}`;
    add({ accountId: accCurrent, postedAt: iso(year, month, 6), amount: 2_000_000, direction: "debit", type: "transfer", merchantName: "Chuyển sang tiết kiệm", merchantNormalizedName: "transfer savings", categoryId: CATEGORY.transfer, status: "posted", isRecurring: true, userEdited: false, transferGroupId: tg });
    add({ accountId: accSavings, postedAt: iso(year, month, 6), amount: 2_000_000, direction: "credit", type: "transfer", merchantName: "Nhận từ thanh toán", merchantNormalizedName: "transfer savings", categoryId: CATEGORY.transfer, status: "posted", isRecurring: true, userEdited: false, transferGroupId: tg });

    // Credit-card payment (excluded from expense)
    if (cap >= 20) {
      add({ accountId: accCredit, postedAt: iso(year, month, 20), amount: jitter(rng, 2_000_000, 0.3, 100_000), direction: "debit", type: "card_payment", merchantName: "Thanh toán thẻ tín dụng", merchantNormalizedName: "card payment", categoryId: CATEGORY.transfer, status: "posted", isRecurring: true, userEdited: false });
    }

    // A refund reversing a shopping purchase
    if (lastShopId.length > 0 && chance(rng, 0.4)) {
      add({ accountId: accCurrent, postedAt: iso(year, month, Math.min(cap, 24)), amount: jitter(rng, 400_000, 0.3, 10_000), direction: "credit", type: "refund", merchantName: "Hoàn tiền Shopee", merchantNormalizedName: "shopee", categoryId: CATEGORY.shopping, status: "posted", isRecurring: false, userEdited: false, relatedTransactionId: pick(rng, lastShopId) });
    }

    // A past external P2P transfer to a non-saved payee (real counterparty
    // account) — the assistant can resolve this recipient from history.
    if (mi === 2) {
      add({ accountId: accCurrent, postedAt: iso(year, month, 8), amount: 3_000_000, direction: "debit", type: "transfer", merchantName: HISTORY_PAYEE.name, merchantNormalizedName: HISTORY_PAYEE.norm, categoryId: CATEGORY.transfer, status: "posted", isRecurring: false, userEdited: false, counterpartyAccountNumber: HISTORY_PAYEE.account, counterpartyBankName: HISTORY_PAYEE.bankName });
    }

    // A reversed (failed) transaction in the second month — excluded from totals
    if (mi === 1) {
      add({ accountId: accCurrent, postedAt: iso(year, month, 12), amount: 550_000, direction: "debit", type: "expense", merchantName: "Nhà hàng (giao dịch lỗi)", merchantNormalizedName: "pho 24", categoryId: CATEGORY.dining, status: "reversed", isRecurring: false, userEdited: false });
    }

    // Pending items in the current month — separated from posted totals
    if (mi === MONTHS - 1) {
      spend(year, month, cap, CATEGORY.dining, 220_000, "pending");
      spend(year, month, cap, CATEGORY.shopping, 780_000, "pending");
    }
  });

  return {
    accounts: buildPersonaAccounts(meta),
    transactions: txns,
    assets: meta.assets,
    liabilities: meta.liabilities,
    budgets: meta.budgets,
    goals: meta.goals,
    snapshots: buildSnapshots(meta, monthList),
    products: meta.products,
  };
}

/**
 * Deterministic, real-shaped mock account number from the persona seed + a salt.
 * Carried on `Account.accountNumber` (full) alongside the masked display form.
 */
function acctNumber(seed: number, salt: number): string {
  const base = String((seed * 1_000_003 + salt * 97) % 1_000_000_000_000).padStart(12, "0");
  return base;
}

/**
 * The three MSB accounts for a persona, ids (`acc_<id>_current`, …) matching the
 * `accountId` on this persona's transaction fixtures. The canonical account
 * definition — the SQLite `accounts` table seeds from here (`accounts-store.ts`
 * + `seed-db.mjs`), so balances/numbers never diverge between fixtures and DB.
 */
export function buildPersonaAccounts(meta: PersonaMeta): Account[] {
  return buildAccounts(meta, `acc_${meta.id}_current`, `acc_${meta.id}_savings`, `acc_${meta.id}_credit`);
}

function buildAccounts(meta: PersonaMeta, current: string, savings: string, credit: string): Account[] {
  const now = "2026-09-15T00:00:00.000Z";
  const scale = meta.params.salaryBase / 25_000_000;
  const seed = meta.params.seed;
  const number = (salt: number) => acctNumber(seed, salt);
  const mask = (salt: number) => maskAccountNumber(number(salt));
  return [
    { id: current, type: "current", institution: "MSB", currency: CURRENCY_VND, balance: Math.round(18_000_000 * scale), availableBalance: Math.round(18_000_000 * scale), lastSyncedAt: now, source: "msb", tier: meta.tier, maskedNumber: mask(1), accountNumber: number(1) },
    { id: savings, type: "savings", institution: "MSB", currency: CURRENCY_VND, balance: Math.round(45_000_000 * scale), availableBalance: Math.round(45_000_000 * scale), lastSyncedAt: now, source: "msb", maskedNumber: mask(2), accountNumber: number(2) },
    { id: credit, type: "credit_card", institution: "MSB", currency: CURRENCY_VND, balance: -Math.round(8_000_000 * scale), availableBalance: Math.round(50_000_000 * scale), lastSyncedAt: now, source: "msb", maskedNumber: mask(3), accountNumber: number(3) },
  ];
}

function buildSnapshots(meta: PersonaMeta, monthList: { key: string }[]): MonthlySnapshot[] {
  const assetsBase = meta.assets.reduce((s, a) => s + (a.value ?? 0), 0);
  const liabBase = meta.liabilities.reduce((s, l) => s + (l.outstandingPrincipal ?? 0), 0);
  const n = monthList.length;
  return monthList.map(({ key }, i) => {
    const growth = 1 - (n - 1 - i) * 0.015; // assets slightly lower in the past
    const paydown = 1 + (n - 1 - i) * 0.01; // liabilities slightly higher in the past
    const assetsTotal = Math.round(assetsBase * growth);
    const liabilitiesTotal = Math.round(liabBase * paydown);
    return { month: key, assetsTotal, liabilitiesTotal, netWorth: assetsTotal - liabilitiesTotal, source: "self_reported" };
  });
}
