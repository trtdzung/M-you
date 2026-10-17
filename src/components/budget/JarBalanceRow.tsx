import { Money } from "@/components/primitives";
import { jarSpendable } from "@/domain/engine";
import { formatVnd } from "@/lib/format";

/**
 * The SỐ DƯ line of a jar card — the balance axis, deliberately separate from the
 * đã-tiêu/hạn-mức bar above it (the plan axis). An inter-jar transfer moves this
 * number and nothing else, so the note on the right explains where the difference
 * came from instead of quietly rewriting the jar's limit.
 *
 * A hũ is a money container: it CANNOT hold negative money, so the displayed
 * balance is floored at 0 via the engine's own `jarSpendable` — the same rule
 * `JarEnvelopeCard` (Tổng quan) and the header's "Còn lại|Vượt" already follow, so
 * one jar never reads "0 ₫" on one screen and "−300.000 ₫" on another. The
 * uncovered part is NOT dropped: `ManualCoverNotice` renders directly below on
 * exactly the same condition (`remaining < 0`) and carries it as "Cần bù".
 *
 * Presentation-only: `balance` is `JarBudgetLine.remaining` and `net` is
 * `rebalanceNet`, both already computed by the engine (invariant #2).
 */
export function JarBalanceRow({ balance, net }: { balance: number | null; net: number }) {
  const shown = jarSpendable(balance);
  if (shown === null) return null;
  const note =
    net > 0
      ? `Đã nhận ${formatVnd(net)} từ hũ khác`
      : net < 0
        ? `Đã chuyển ${formatVnd(-net)} sang hũ khác`
        : null;
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted">
        Số dư <Money amount={shown} className="ml-1 font-semibold text-text" />
      </span>
      {note && <span className="truncate text-muted">{note}</span>}
    </div>
  );
}
