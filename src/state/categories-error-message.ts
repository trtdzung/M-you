/**
 * Vietnamese user-facing copy for a failed `/api/categories*` call (U10/U20),
 * mirroring `jars-error-message.ts`. The provider throws a transport-level
 * `ApiError`; this maps it to one sentence a settings/picker surface can show
 * verbatim, keeping the server's own numbers (the exact `usedBy` count) so the
 * message matches the deterministic check that produced it.
 */

import { ApiError } from "@/providers/api-error";

export const CATEGORY_LOAD_ERROR = "Không tải được danh mục. Vui lòng thử lại.";

export function categoryMutationErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // 409 in-use: deleting would move real historical spend out of a real hũ, so
    // the server refuses and the copy points at the escape hatch (ẩn danh mục).
    if (err.status === 409 && err.serverMessage === "category in use") {
      return err.usedBy != null
        ? `Danh mục đang dùng ở ${err.usedBy} giao dịch. Hãy ẩn danh mục thay vì xoá.`
        : "Danh mục đang được sử dụng. Hãy ẩn danh mục thay vì xoá.";
    }
    if (err.status === 409) return "Tên danh mục đã tồn tại. Hãy chọn tên khác.";
    if (err.status === 403) return "Không sửa được danh mục mặc định của hệ thống.";
    if (err.status === 404) return "Danh mục này không còn tồn tại. Danh sách đã được làm mới.";
    if (err.status === 422) {
      return `Không lưu được danh mục: dữ liệu không hợp lệ${err.serverMessage ? ` (${err.serverMessage})` : ""}.`;
    }
  }
  return "Không lưu được danh mục. Vui lòng thử lại.";
}

/**
 * The SERVER's count of records still pointing at a category, taken from a
 * refused delete (`409 { error: "category in use", usedBy }`); `null` for every
 * other failure. The delete sheet turns this into its "ẩn danh mục" offer, so the
 * number the user reads is the one the deterministic check refused on — never a
 * client-side recount over a possibly stale corrections cache (invariant #6: an
 * unknown count stays unknown rather than being invented).
 */
export function categoryInUseCount(err: unknown): number | null {
  if (err instanceof ApiError && err.status === 409 && err.serverMessage === "category in use") {
    return err.usedBy;
  }
  return null;
}
