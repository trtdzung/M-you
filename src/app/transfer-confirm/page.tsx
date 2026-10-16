import { Suspense } from "react";
import { TransferConfirm } from "./TransferConfirm";

/**
 * Mock MSB transfer-confirm screen (outside the AI facade). Prefilled from the
 * draft the assistant prepared, but every field is editable and the human alone
 * confirms + authenticates. `useSearchParams` requires a Suspense boundary.
 */
export default function TransferConfirmPage() {
  return (
    <div>
      <header className="mb-4">
        <h1 className="text-lg font-semibold text-text">Xác nhận chuyển tiền</h1>
        <p className="text-xs text-muted">Bạn kiểm tra, chỉnh sửa và tự xác nhận — bản mô phỏng</p>
      </header>
      <Suspense fallback={<p className="text-sm text-muted">Đang tải…</p>}>
        <TransferConfirm />
      </Suspense>
    </div>
  );
}
