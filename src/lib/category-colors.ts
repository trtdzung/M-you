/**
 * One stable color map keyed by category id, shared by the Dòng tiền donut and
 * bar list so a category is the same hue in both (red-team #8 — never two
 * palettes). Colors are assigned by the category's fixed position in the expense
 * taxonomy, so a category keeps its hue across periods and jar filters. The
 * palette is a small, harmonious set (brand orange + supporting hues), not a
 * rainbow; orphans / unknown ids fall back to a neutral slate.
 */

import { CATEGORIES, INCOME, REBALANCE_CATEGORY, UNCLASSIFIED } from "@/domain/models";
import { KHAC_JAR_ID } from "@/domain/engine/category-jars";

/**
 * ≤8 hues as one accent-anchored family: MSB brand orange leads, followed by a
 * warm analogous run (coral → apricot → amber → sienna) and three muted cool
 * supports (teal → slate blue → plum). Warm-dominant and moderated in chroma so
 * it reads as a coordinated MSB set, not a rainbow (Phase 05 C4). Slot ordering
 * is the stability contract (RT #8) — only these VALUES are tuned, never which
 * categoryId maps to which slot.
 */
const PALETTE = [
  "#f26522", // 0 brand orange — primary accent
  "#e8654e", // 1 coral (warm)
  "#f2a24a", // 2 apricot (warm)
  "#d98324", // 3 amber (warm)
  "#a8562a", // 4 sienna (warm)
  "#0e7490", // 5 teal (cool complement, muted)
  "#3f6d8e", // 6 slate blue (cool, muted)
  "#6b4e71", // 7 plum (cool, desaturated)
] as const;

/**
 * Tầng màu thứ hai, dành cho danh mục NGƯỜI DÙNG TỰ TẠO. Cố tình rời hẳn khỏi
 * `PALETTE`: không giá trị nào trùng, nên một danh mục tuỳ chỉnh không bao giờ
 * đội lốt màu của danh mục mặc định. Vẫn cùng họ (ấm dẫn đầu, lạnh đỡ nền) để
 * biểu đồ đọc ra một bộ thống nhất chứ không thành cầu vồng.
 */
const PALETTE_CUSTOM = [
  "#b8501c", // 0 rust — brand orange đậm
  "#c2554a", // 1 brick — coral đậm
  "#c98a3e", // 2 ochre — apricot đậm
  "#9e6a1f", // 3 bronze — amber đậm
  "#7d4526", // 4 umber — sienna đậm
  "#2a94a8", // 5 cyan-teal — teal sáng
  "#6d90ad", // 6 dusty blue — slate sáng
  "#8f6d95", // 7 mauve — plum sáng
] as const;

/** Neutral for the catch-all "Khác" group and any unmapped id. */
export const CATEGORY_COLOR_FALLBACK = "#94a3b8";

/**
 * Các id KHÔNG phải danh mục chi tiêu: ba sentinel của taxonomy và id nhóm
 * catch-all. Chúng giữ xám trung tính thay vì được băm ra màu — "Chưa phân
 * loại" mà có màu riêng trông như một danh mục thật (trái bất biến #6).
 * Danh sách tường minh, không dùng phép thử tiền tố: một danh mục người dùng đặt
 * tên trùng tiền tố cũng không được lọt vào đây.
 */
const NEUTRAL_CATEGORY_IDS: ReadonlySet<string> = new Set([
  UNCLASSIFIED,
  INCOME,
  REBALANCE_CATEGORY,
  KHAC_JAR_ID,
]);

/**
 * Băm FNV-1a 32-bit trên id. Thuần tuý — không `Math.random`, không `Date`,
 * không phụ thuộc locale — nên màu ổn định qua mọi lần chạy và mọi máy. Băm theo
 * ID chứ không theo NHÃN: id được slug một lần lúc tạo và bất biến, nên đổi tên
 * danh mục không làm màu nhảy.
 */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const EXPENSE_ORDER: readonly string[] = CATEGORIES.filter((c) => c.kind === "expense").map(
  (c) => c.id,
);

const COLOR_BY_ID: Map<string, string> = new Map(
  EXPENSE_ORDER.map((id, i) => [id, PALETTE[i % PALETTE.length]]),
);

/**
 * Màu ổn định cho một id danh mục. Ba tầng, theo đúng thứ tự:
 *  1. Danh mục preset → slot cố định trong `PALETTE` (hợp đồng RT#8, bất biến).
 *  2. Sentinel / id nhóm / id rỗng → xám trung tính.
 *  3. Còn lại (danh mục người dùng tự tạo) → băm id vào `PALETTE_CUSTOM`.
 *
 * Quá 8 danh mục tuỳ chỉnh thì có thể trùng màu nhau — chấp nhận được, vì mọi
 * lát biểu đồ đều có nhãn đi kèm; điều KHÔNG chấp nhận được là trùng màu với một
 * danh mục preset, và tầng 3 tách bảng màu riêng nên chuyện đó không xảy ra.
 */
export function categoryColor(categoryId: string): string {
  const preset = COLOR_BY_ID.get(categoryId);
  if (preset) return preset;
  if (!categoryId || NEUTRAL_CATEGORY_IDS.has(categoryId)) return CATEGORY_COLOR_FALLBACK;
  return PALETTE_CUSTOM[fnv1a(categoryId) % PALETTE_CUSTOM.length];
}

/** The jar-color swatches offered in settings (the shared accent family). */
export const JAR_COLOR_OPTIONS: readonly string[] = PALETTE;

/**
 * A jar's display accent: its stored `color` if the user picked one, else the
 * hue of its first category, else neutral slate (a category-less jar like
 * "Tiết kiệm"). Keeps one source of truth for jar color across screens.
 */
export function jarAccent(jar: { color?: string; categoryIds: string[] }): string {
  if (jar.color) return jar.color;
  const first = jar.categoryIds[0];
  return first ? categoryColor(first) : CATEGORY_COLOR_FALLBACK;
}
