import { Suspense } from "react";
import { TransferCompose } from "@/components/transfer/TransferCompose";

/** `TransferCompose` reads an optional agent-proposed prefill from the query string (`useSearchParams` requires a Suspense boundary). */
export default function TransferPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Đang tải…</p>}>
      <TransferCompose />
    </Suspense>
  );
}
