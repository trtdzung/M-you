import "server-only";
import { createHash } from "node:crypto";
import { buildCustomerSnapshot, type SnapshotOverlay } from "@/insights/proactive/snapshot";
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
import { DEMO_NOW } from "./demo-clock";
import { REBALANCE_CATEGORY, type Transaction } from "@/domain/models";

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
    return { id: `session-topup-${i}`, accountId: "self-reported", postedAt: DEMO_NOW.toISOString(), amount: t.amount,
      currency: "VND", direction: "debit", type: "transfer", categoryId: REBALANCE_CATEGORY,
      merchantName: "Phân bổ trong phiên", merchantNormalizedName: "session allocation", status: "posted", source: "self_reported",
      isRecurring: false, userEdited: true,
      rebalance: { fromJarId: "pool", toJarId: t.jarId, origin: "manual", triggerTxnId: `session-${i}` } };
  });
  const corrections = readCorrections(cif);
  const transactions = applyCorrections([...readManualTxns(cif), ...readTransactions(cif)], corrections)
    .filter((t) => !isHidden(corrections, t.id));
  const snapshot = buildCustomerSnapshot({ ...dataset, accounts: readAccounts(cif), transactions }, jarConfig,
    readCategories(cif, { includeArchived: true }), profile, sessionTopups, DEMO_NOW);
  return { snapshot, snapshotId: snapshotHash(cif, snapshot) };
}
