/**
 * Jar templates for the BIDV wallet model (plan 260910-1626). Each jar groups
 * expense categories and carries a SUGGESTED monthly `budgetLimit` (estimated —
 * the user confirms or edits it at onboarding/settings). No category appears in
 * two jars (one-category-one-jar) and every template covers all expense
 * categories (no orphan → no "Khác" jar on seed).
 *
 * The "savings" jar has no categories (spend is always 0), so its limit is
 * genuinely meaningless — `budgetLimit` stays `undefined` (unknown, never 0).
 *
 * IDs are validated against the current taxonomy so a provisional category set
 * never seeds an unknown id into a jar.
 */

import type { Budget, Jar, JarConfig, JarRole } from "./index";
import { CATEGORY_BY_ID } from "./categories";

/** Keep only ids that currently exist as an expense category. */
function expenseOnly(ids: string[]): string[] {
  return ids.filter((id) => CATEGORY_BY_ID[id]?.kind === "expense");
}

const jar = (
  id: string,
  label: string,
  categoryIds: string[],
  role: JarRole,
  budgetLimit?: number,
): Jar => ({
  id,
  label,
  categoryIds: expenseOnly(categoryIds),
  role,
  ...(budgetLimit !== undefined ? { budgetLimit } : {}),
});

export interface JarTemplate {
  id: "caNhan" | "giaDinh" | "kinhDoanh";
  label: string;
  description: string;
  jars: Jar[];
}

/** Cá nhân — 6 hũ. Personal budgeting; a small residual stays "chưa phân bổ". */
const caNhan: JarTemplate = {
  id: "caNhan",
  label: "Cá nhân",
  description: "6 hũ cho chi tiêu cá nhân",
  jars: [
    jar("essentials", "Thiết yếu", ["housing", "utilities", "insurance", "subscriptions"], "essential", 8_000_000),
    jar("food", "Ăn uống", ["dining", "groceries"], "spending", 4_000_000),
    jar("transport", "Di chuyển", ["transport"], "spending", 1_500_000),
    jar("lifestyle", "Hưởng thụ", ["entertainment", "shopping"], "spending", 2_500_000),
    jar("health", "Sức khỏe", ["health"], "spending", 1_000_000),
    jar("savings", "Tiết kiệm", [], "buffer"), // no categories → no meaningful limit (unset)
  ],
};

/** Gia đình — 4 hũ. Fewer, larger buckets for a household. */
const giaDinh: JarTemplate = {
  id: "giaDinh",
  label: "Gia đình",
  description: "4 hũ cho chi tiêu gia đình",
  jars: [
    jar("household", "Thiết yếu", ["housing", "utilities", "insurance", "subscriptions", "groceries"], "essential", 12_000_000),
    jar("care", "Ăn uống & sức khỏe", ["dining", "health"], "spending", 4_000_000),
    jar("mobility", "Đi lại & mua sắm", ["transport", "shopping"], "spending", 3_000_000),
    jar("leisure", "Hưởng thụ", ["entertainment"], "spending", 2_000_000),
  ],
};

/** Kinh doanh — 3 hũ. A simple split for a small-business owner. */
const kinhDoanh: JarTemplate = {
  id: "kinhDoanh",
  label: "Kinh doanh",
  description: "3 hũ cho chủ hộ kinh doanh",
  jars: [
    jar("fixed", "Chi phí cố định", ["housing", "utilities", "insurance", "subscriptions"], "essential", 15_000_000),
    jar("operations", "Vận hành", ["transport", "groceries", "dining"], "spending", 8_000_000),
    jar("reserve", "Dự phòng & khác", ["health", "shopping", "entertainment"], "buffer", 3_000_000),
  ],
};

export const JAR_TEMPLATES: Record<JarTemplate["id"], JarTemplate> = {
  caNhan,
  giaDinh,
  kinhDoanh,
};

/** Ordered list for a picker UI. */
export const JAR_TEMPLATE_LIST: JarTemplate[] = [caNhan, giaDinh, kinhDoanh];

/** A fresh v3 config from a template's jars (deep-copied by the caller). */
export function configFromTemplate(template: JarTemplate): JarConfig {
  return { version: 3, jars: template.jars };
}

/** First-load default: Cá nhân. The setup screen lets the user switch template. */
export const DEFAULT_JAR_CONFIG: JarConfig = configFromTemplate(caNhan);

/**
 * Derive per-category monthly `Budget`s from jars — the "hũ IS the budget" map.
 * A jar carries ONE group `budgetLimit` spanning several expense categories, so
 * the limit is split evenly across the jar's categories, with any rounding
 * remainder folded into the first category. The per-category budgets therefore
 * always sum EXACTLY back to the (whole-VND rounded) jar limit (no drift, no
 * fractional đồng). A jar with no limit
 * ("chưa đặt", e.g. "Tiết kiệm") or no categories contributes nothing — its
 * limit stays genuinely unknown rather than a silent 0 (invariant #6).
 */
export function budgetsFromJars(jars: Jar[]): Budget[] {
  const budgets: Budget[] = [];
  for (const jar of jars) {
    const raw = jar.budgetLimit;
    // A corrupt limit (non-finite / negative) is unknown, never split into NaN.
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) continue;
    if (jar.categoryIds.length === 0) continue;
    // Whole VND only (B13): round the limit, floor each split, remainder → first.
    const limit = Math.round(raw);
    const count = jar.categoryIds.length;
    const base = Math.floor(limit / count);
    const remainder = limit - base * count;
    jar.categoryIds.forEach((categoryId, i) => {
      budgets.push({ categoryId, limit: base + (i === 0 ? remainder : 0), period: "monthly" });
    });
  }
  return budgets;
}
