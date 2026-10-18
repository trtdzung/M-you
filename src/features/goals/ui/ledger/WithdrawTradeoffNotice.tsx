import { formatVnd } from "@/lib/format";
import { withdrawTradeoff } from "../../engine/withdraw-tradeoff";
import { GOALS_COPY } from "../copy";
import { warningBox } from "../styles";

/** "Rút X sẽ lùi khoảng N tuần"; without a usable pace only the amount is stated. */
export function WithdrawTradeoffNotice({
  amount,
  monthlyPace,
}: {
  amount: number;
  monthlyPace: number | null;
}) {
  const { weeks } = withdrawTradeoff({ amount, monthlyPace });
  return <p className={warningBox}>{GOALS_COPY.withdrawTradeoff(formatVnd(amount), weeks)}</p>;
}
