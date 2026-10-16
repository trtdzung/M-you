/**
 * Vietnamese user-facing copy for a failed `/api/jars*` call (U10/U20). The
 * provider throws a transport-level `JarApiError`; this maps it to one sentence
 * the settings/budget screens can show verbatim. Over-cap keeps the server's
 * exact `overBy` so the message matches the deterministic cap check.
 */

import { JarApiError } from "@/providers/jar-api-error";
import { formatVnd } from "@/lib/format";

export const JAR_LOAD_ERROR = "Không tải được danh sách hũ. Vui lòng thử lại.";

export function jarMutationErrorMessage(err: unknown): string {
  if (err instanceof JarApiError) {
    if (err.isOverCap) {
      return err.overBy != null
        ? `Vượt số dư ${formatVnd(err.overBy)}. Giảm hạn mức lại.`
        : "Chưa có số dư tài khoản để tăng hạn mức.";
    }
    if (err.status === 404) return "Hũ này không còn tồn tại. Danh sách hũ đã được làm mới.";
    if (err.status === 422) {
      return `Không lưu được thay đổi: dữ liệu không hợp lệ${err.serverMessage ? ` (${err.serverMessage})` : ""}.`;
    }
  }
  return "Không lưu được thay đổi hũ. Vui lòng thử lại.";
}
