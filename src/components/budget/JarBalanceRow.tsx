import { Money } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * The SỐ DƯ line of a jar card — the balance axis, deliberately separate from the
 * đã-tiêu/hạn-mức bar above it (the plan axis). An inter-jar transfer moves this
 * number and nothing else, so the note on the right explains where the difference
 * came from instead of quietly rewriting the jar's limit.
 *
 * Presentation-only: `balance` is `JarBudgetLine.remaining` and `net` is
 * `rebalanceNet`, both already computed by the engine (invariant #2).
 */
export function JarBalanceRow({ balance, net }: { balance: number | null; net: number }) {
  if (balance === null) return null;
  const note =
    net > 0
      ? `Đã nhận ${formatVnd(net)} từ hũ khác`
      : net < 0
        ? `Đã chuyển ${formatVnd(-net)} sang hũ khác`
        : null;
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted">
        Số dư{" "}
        <Money
          amount={balance}
          className={cn("ml-1 font-semibold", balance < 0 ? "text-negative" : "text-text")}
        />
      </span>
      {note && <span className="truncate text-muted">{note}</span>}
    </div>
  );
}
