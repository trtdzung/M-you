/**
 * Vietnamese user-facing copy for a failed `/api/jars*` / `/api/jar-ledger` call
 * (U10/U20). The provider throws a transport-level `ApiError`; this maps it to one
 * sentence the settings/budget screens can show verbatim. Over-cap keeps the
 * server's exact `overBy` and over-balance its `maxWithdraw`, so the message
 * matches the deterministic server check.
 */

import { ApiError } from "@/providers/api-error";
import { formatVnd } from "@/lib/format";

export const JAR_LOAD_ERROR = "Không tải được danh sách hũ. Vui lòng thử lại.";

export function jarMutationErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isOverCap) {
      return err.overBy != null
        ? `Vượt số dư ${formatVnd(err.overBy)} so với tài khoản. Giảm số tiền nạp vào hũ.`
        : "Chưa có số dư tài khoản để nạp vào hũ.";
    }
    if (err.isOverBalance) {
      return err.maxWithdraw != null
        ? `Chỉ rút tối đa ${formatVnd(err.maxWithdraw)} khỏi hũ này.`
        : "Hũ chưa có số dư nên chưa rút được.";
    }
    if (err.status === 404) return "Hũ này không còn tồn tại. Danh sách hũ đã được làm mới.";
    if (err.status === 422 && err.serverMessage === "jar not persisted") {
      return "Hũ “Khác” do hệ thống tạo nên chưa nạp/rút được số dư.";
    }
    if (err.status === 422) {
      return `Không lưu được thay đổi: dữ liệu không hợp lệ${err.serverMessage ? ` (${err.serverMessage})` : ""}.`;
    }
  }
  return "Không lưu được thay đổi hũ. Vui lòng thử lại.";
}

/**
 * The confirmation a template apply / restore defaults needs when the replace
 * would delete jars that still hold a balance (Red Team #11). Also the refusal
 * reason `applyTemplate`/`resetToSeed` surface when called without confirmation,
 * so a future dialog and the state guard say the same thing.
 */
export function balanceLossPrompt(labels: readonly string[]): string {
  return `Áp mẫu sẽ xoá ${labels.length} hũ đang có số dư (${labels.join(", ")}) — xoá cả số dư của các hũ này. Tiếp tục?`;
}
