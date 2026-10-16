import { Suspense } from "react";
import { TransferConfirm } from "./TransferConfirm";

/**
 * Mock MSB transfer-confirm screen (outside the AI facade). Prefilled from the
 * draft the assistant prepared, but every field is editable and the human alone
 * confirms + authenticates. `useSearchParams` requires a Suspense boundary.
 * `TransferConfirm` owns its own header — it differs between the editable form
 * and the post-confirm success receipt.
 */
export default function TransferConfirmPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Đang tải…</p>}>
      <TransferConfirm />
    </Suspense>
  );
}
