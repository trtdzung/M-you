import type { Jar } from "@/domain/models";
import { Money } from "@/components/primitives";
import type { CurrentJarFunds } from "@/state/use-current-jar-funds";
import { cn } from "@/lib/cn";

/**
 * The sub-line of a jar row in Cài đặt → "Hũ & danh mục": category count, HẠN MỨC
 * (monthly plan, "chưa đặt hạn mức" when unset) and SỐ DƯ (running balance,
 * "chưa có số dư" when unfunded — never 0, invariant #6) as two separate figures.
 * The balance is the engine's current-month value via `useCurrentJarFunds`.
 */
export function HuJarRowFigures({ jar, funds }: { jar: Jar; funds: CurrentJarFunds }) {
  const balance = funds.status === "ready" ? funds.balanceOf(jar.id) : null;
  return (
    <span className="mt-0.5 block text-xs text-muted">
      {jar.categoryIds.length} danh mục · Hạn mức{" "}
      {jar.budgetLimit != null ? <Money amount={jar.budgetLimit} className="text-muted" /> : "chưa đặt"}
      {" · Số dư "}
      {funds.status === "loading" ? (
        "đang tải…"
      ) : funds.status === "error" ? (
        "—"
      ) : balance === null ? (
        "chưa có số dư"
      ) : (
        <Money amount={balance} className={cn(balance < 0 ? "text-negative" : "text-muted")} />
      )}
    </span>
  );
}
