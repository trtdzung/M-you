import type { Jar } from "@/domain/models";
import { jarAccent } from "@/lib/category-colors";

/**
 * Phép tính thuần cho một cú chạm trong `HuCategoryPicker`. Tách khỏi React để
 * test được trực tiếp — không import component, không gọi mạng.
 */

/** Bật/tắt một danh mục trong tập đang chọn (giữ nguyên thứ tự các id còn lại). */
export function toggleCategoryId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((c) => c !== id) : [...ids, id];
}

/**
 * Patch gửi lên `PATCH /api/jars/:id` cho tập danh mục mới.
 *
 * Ghim màu: `jarAccent` lấy màu theo danh mục ĐẦU TIÊN của hũ khi người dùng
 * chưa tự chọn màu (`src/lib/category-colors.ts`). Vậy nên chỉ cần bỏ chọn danh
 * mục đầu là icon của hũ, hàng trong cài đặt và mọi chip trên biểu đồ đổi màu —
 * một hệ quả không ai ngờ tới từ thao tác gắn danh mục. Nếu tập mới làm màu đổi,
 * ta ghim luôn màu người dùng ĐANG NHÌN THẤY vào cùng patch đó: một lượt ghi,
 * không có nhịp repaint trung gian.
 *
 * Đánh đổi chấp nhận được: hàng swatch "Màu" từ chỗ chưa chọn gì sẽ hiện một ô
 * đang chọn. Thà vậy còn hơn để màu tự trôi.
 */
export function nextCategoryPatch(
  jar: Jar,
  nextIds: string[],
): { categoryIds: string[]; color?: string } {
  if (jar.color) return { categoryIds: nextIds };
  const current = jarAccent(jar);
  const after = jarAccent({ categoryIds: nextIds });
  return after === current ? { categoryIds: nextIds } : { categoryIds: nextIds, color: current };
}
