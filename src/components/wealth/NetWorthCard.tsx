import { AlertTriangle } from "lucide-react";
import type { NetWorthResult } from "@/domain/engine";
import { Card, Freshness, Money, Stat } from "@/components/primitives";

/** Headline net-worth summary with unknown-coverage disclosure. */
export function NetWorthCard({ networth }: { networth: NetWorthResult }) {
  return (
    <Card>
      <Stat
        label="Giá trị ròng"
        value={<Money amount={networth.total} className="text-2xl" />}
        hint={networth.hasUnknown ? "Chưa gồm tài sản chưa định giá" : undefined}
      />
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
        <Stat label="Tài sản" value={<Money amount={networth.assetsTotal} className="text-positive" />} />
        <Stat label="Nợ" value={<Money amount={networth.liabilitiesTotal} className="text-negative" />} />
      </div>
      <div className="mt-3">
        <Freshness at={networth.meta.freshness} />
      </div>
      {networth.hasUnknown && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft/50 p-2 text-xs text-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{networth.unknownFields.join(", ")} chưa có giá trị nên không được cộng vào tổng.</span>
        </div>
      )}
    </Card>
  );
}
