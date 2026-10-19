import "server-only";
import { createHash } from "node:crypto";
import { buildCustomerSnapshot, type SnapshotOverlay, type SecuritySummaryInput } from "@/insights/proactive/snapshot";
import { PERSONA_LIST } from "@/providers/mock/personas";
import { generateDataset } from "@/providers/mock/fixtures/generate";
import { readAccounts } from "./accounts-store";
import { readCategories } from "./categories-store";
import { readCorrections } from "./corrections-store";
import { readJarConfig } from "./jars-store";
import { readTransactions } from "./transactions-store";
import { readManualTxns } from "./manual-txns-store";
import { applyCorrections, isHidden } from "@/state/corrections-core";
import { isValidAssetRecord, isValidLiabilityRecord } from "@/domain/models/asset-liability-input";
import { isValidGoalRecord } from "@/domain/models/goal-input";
import { appNow } from "./app-clock";
import { REBALANCE_CATEGORY, type Transaction } from "@/domain/models";
import { readProfile } from "./security/profile-store";
import { readCases } from "./security/case-store";
import { securityScore } from "@/components/settings/security/security-score";
import { getDb } from "./db";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function snapshotHash(cif: string, value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical({ cif, value, policy: "home-snapshot-v2.0" }))).digest("hex");
}

export function customerSnapshot(cif: string, input: unknown = {}) {
  const persona = PERSONA_LIST.find((p) => p.cif === cif);
  if (!persona) throw new RangeError("Unknown customer");
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const p = body.profile && typeof body.profile === "object" ? body.profile as Record<string, unknown> : {};
  const profile: SnapshotOverlay = { assets: [], liabilities: [], goals: [], complete: p.complete === true };
  const dataset = generateDataset(persona);
  for (const [key, guard, seeded] of [
    ["assets", isValidAssetRecord, dataset.assets], ["liabilities", isValidLiabilityRecord, dataset.liabilities],
    ["goals", isValidGoalRecord, dataset.goals],
  ] as const) {
    const rows = p[key] ?? [];
    if (!Array.isArray(rows) || rows.length > 100) throw new RangeError("Invalid profile");
    const ids = new Set(seeded.map((r) => r.id));
    for (const row of rows) {
      if (!guard(row) || row.source !== "self_reported" || ids.has(row.id)) throw new RangeError("Invalid profile record");
      ids.add(row.id);
    }
    Object.assign(profile, { [key]: rows.slice().sort((a, b) => a.id.localeCompare(b.id)) });
  }
  const jarConfig = readJarConfig(cif);
  const topups = body.topups ?? [];
  if (!Array.isArray(topups) || topups.length > 100) throw new RangeError("Invalid topups");
  const sessionTopups: Transaction[] = topups.map((value, i) => {
    const t = value as { jarId?: unknown; amount?: unknown };
    if (!t || typeof t.jarId !== "string" || !jarConfig.jars.some((j) => j.id === t.jarId) ||
      typeof t.amount !== "number" || !Number.isSafeInteger(t.amount) || t.amount <= 0 || t.amount > 1e12) throw new RangeError("Invalid topup");
    return { id: `session-topup-${i}`, accountId: "self-reported", postedAt: appNow(cif).toISOString(), amount: t.amount,
      currency: "VND", direction: "debit", type: "transfer", categoryId: REBALANCE_CATEGORY,
      merchantName: "Phân bổ trong phiên", merchantNormalizedName: "session allocation", status: "posted", source: "self_reported",
      isRecurring: false, userEdited: true,
      rebalance: { fromJarId: "pool", toJarId: t.jarId, origin: "manual", triggerTxnId: `session-${i}` } };
  });
  const corrections = readCorrections(cif);
  const transactions = applyCorrections([...readManualTxns(cif), ...readTransactions(cif)], corrections)
    .filter((t) => !isHidden(corrections, t.id));

  let securitySummary: SecuritySummaryInput | undefined;
  try {
    const profileState = readProfile(cif);
    const activeEmergencies = (profileState.emergencyContacts ?? []).filter((c) => c.status === "active").length;
    const demoInput = body.demo && typeof body.demo === "object" ? body.demo as Record<string, unknown> : {};
    const passwordUpdated = demoInput.passwordUpdated === true;
    const faceId = demoInput.faceId !== false;
    const advanced = demoInput.advanced === true;
    const devicesCleared = demoInput.devicesCleared === true;

    const secScore = securityScore({
      passwordUpdated,
      faceId,
      advanced,
      devicesCleared,
      aiProtect: Boolean(profileState.aiProtect),
      antiPhishing: profileState.antiPhishingCode !== null,
      activeEmergencyContacts: activeEmergencies,
      trustedContacts: (profileState.trustedContacts ?? []).length,
    });
    let hasActiveHold = false;
    try {
      const db = getDb();
      const holdRow = db.prepare("SELECT 1 FROM transfer_holds WHERE cif = ? AND status = 'holding' LIMIT 1").get(cif);
      hasActiveHold = Boolean(holdRow);
    } catch {
      // transfer_holds might not be loaded in isolated tests
    }
    const hasPendingOff = Object.keys(profileState.pendingOff || {}).length > 0;

    let hasActiveCase = false;
    try {
      const cases = readCases(cif);
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      hasActiveCase = cases.some((c) => Math.abs(nowTime - c.openedAt) <= THIRTY_DAYS_MS);
    } catch {
      // case store might not be loaded in isolated tests
    }

    // Scan transactions for fraud/security signals
    const nowTime = appNow(cif).getTime();
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

    let largeUnknownInflow: { amount: number; senderName?: string } | undefined;
    let baitInflow: { count: number; lastAmount: number; senderName?: string } | undefined;
    let highBalanceInflow: { amount: number } | undefined;

    const creditTxns = transactions
      .filter((t) => t.direction === "credit" && t.amount > 0)
      .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));

    const highInflowTxn = creditTxns.find((t) => t.amount >= 50_000_000);
    if (highInflowTxn) {
      highBalanceInflow = { amount: highInflowTxn.amount };
    }

    const isSalary = (t: Transaction) => {
      const name = (t.merchantNormalizedName || t.merchantName || "").toLowerCase();
      const cat = (t.categoryId || "").toLowerCase();
      return cat === "salary" || name.includes("luong") || name.includes("lương") || name.includes("salary") || name.includes("payroll");
    };

    const largeTxn = creditTxns.find((t) => t.amount >= 10_000_000 && !isSalary(t));
    if (largeTxn) {
      largeUnknownInflow = { amount: largeTxn.amount, senderName: largeTxn.merchantName };
    }

    const recentSmallTxns = creditTxns.filter((t) => {
      const txTime = Date.parse(t.postedAt);
      return !isNaN(txTime) && Math.abs(nowTime - txTime) <= TWO_DAYS_MS && t.amount < 500_000;
    });

    const senderGroups = new Map<string, Transaction[]>();
    for (const t of recentSmallTxns) {
      const sender = (t.merchantNormalizedName || t.merchantName || "unknown").toLowerCase();
      const list = senderGroups.get(sender) ?? [];
      list.push(t);
      senderGroups.set(sender, list);
    }

    for (const [, list] of senderGroups) {
      if (list.length >= 3) {
        baitInflow = {
          count: list.length,
          lastAmount: list[0].amount,
          senderName: list[0].merchantName,
        };
        break;
      }
    }

    // Demo overrides
    if (demoInput.hasActiveCase !== undefined) hasActiveCase = Boolean(demoInput.hasActiveCase);
    if (demoInput.largeUnknownInflow !== undefined) largeUnknownInflow = demoInput.largeUnknownInflow as { amount: number; senderName?: string };
    if (demoInput.baitInflow !== undefined) baitInflow = demoInput.baitInflow as { count: number; lastAmount: number; senderName?: string };
    if (demoInput.highBalanceInflow !== undefined) highBalanceInflow = demoInput.highBalanceInflow as { amount: number };
    const isNewUserOnboarding = demoInput.isNewUserOnboarding === true;

    securitySummary = {
      score: secScore.total,
      hasEmergencyContact: activeEmergencies > 0,
      hasActiveHold: hasActiveHold || hasPendingOff,
      hasPendingOff,
      hasActiveCase,
      largeUnknownInflow,
      baitInflow,
      highBalanceInflow,
      isNewUserOnboarding,
    };
  } catch {
    // Graceful fallback
  }

  const snapshot = buildCustomerSnapshot({ ...dataset, accounts: readAccounts(cif), transactions }, jarConfig,
    readCategories(cif, { includeArchived: true }), profile, sessionTopups, appNow(cif), securitySummary);
  return { snapshot, snapshotId: snapshotHash(cif, snapshot) };
}
