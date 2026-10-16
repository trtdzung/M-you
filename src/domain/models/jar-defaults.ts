/**
 * Jar templates for Model A (snapshot partition). Each template partitions the
 * CURRENT balance by a share (% of balance) per jar; whatever is left flows to
 * the "Chưa phân bổ" residual automatically. Every template's percents sum to
 * ≤ 100 so it can never start over-allocated (red-team guard), and no category
 * appears in two jars (one-category-one-jar). No anchor, no income, no clock —
 * a static literal.
 *
 * IDs are validated against the current taxonomy so a provisional category set
 * never seeds an unknown id into a jar.
 */

import type { Jar, JarConfig } from "./index";
import { CATEGORY_BY_ID } from "./categories";

/** Keep only ids that currently exist as an expense category. */
function expenseOnly(ids: string[]): string[] {
  return ids.filter((id) => CATEGORY_BY_ID[id]?.kind === "expense");
}

const jar = (id: string, label: string, categoryIds: string[], percent: number): Jar => ({
  id,
  label,
  categoryIds: expenseOnly(categoryIds),
  allocation: { mode: "percent", value: percent },
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
    jar("essentials", "Thiết yếu", ["housing", "utilities", "insurance", "subscriptions"], 40),
    jar("food", "Ăn uống", ["dining", "groceries"], 18),
    jar("transport", "Di chuyển", ["transport"], 7),
    jar("lifestyle", "Hưởng thụ", ["entertainment", "shopping"], 10),
    jar("health", "Sức khỏe", ["health"], 5),
    jar("savings", "Tiết kiệm", [], 10),
  ],
};

/** Gia đình — 4 hũ. Fewer, larger buckets for a household. */
const giaDinh: JarTemplate = {
  id: "giaDinh",
  label: "Gia đình",
  description: "4 hũ cho chi tiêu gia đình",
  jars: [
    jar("household", "Thiết yếu", ["housing", "utilities", "insurance", "subscriptions", "groceries"], 50),
    jar("care", "Ăn uống & sức khỏe", ["dining", "health"], 20),
    jar("mobility", "Đi lại & mua sắm", ["transport", "shopping"], 15),
    jar("leisure", "Hưởng thụ", ["entertainment"], 10),
  ],
};

/** Kinh doanh — 3 hũ. A simple split for a small-business owner. */
const kinhDoanh: JarTemplate = {
  id: "kinhDoanh",
  label: "Kinh doanh",
  description: "3 hũ cho chủ hộ kinh doanh",
  jars: [
    jar("fixed", "Chi phí cố định", ["housing", "utilities", "insurance", "subscriptions"], 45),
    jar("operations", "Vận hành", ["transport", "groceries", "dining"], 25),
    jar("reserve", "Dự phòng & khác", ["health", "shopping", "entertainment"], 15),
  ],
};

export const JAR_TEMPLATES: Record<JarTemplate["id"], JarTemplate> = {
  caNhan,
  giaDinh,
  kinhDoanh,
};

/** Ordered list for a picker UI. */
export const JAR_TEMPLATE_LIST: JarTemplate[] = [caNhan, giaDinh, kinhDoanh];

/** A fresh v2 config from a template's jars (deep-copied by the caller). */
export function configFromTemplate(template: JarTemplate): JarConfig {
  return { version: 2, jars: template.jars };
}

/** First-load default: Cá nhân. The setup screen lets the user switch template. */
export const DEFAULT_JAR_CONFIG: JarConfig = configFromTemplate(caNhan);
