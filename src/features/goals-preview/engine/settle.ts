import type { WorldState } from "../model/state";
import type { Goal, ISODate, MsbAsset } from "../model/types";
import { nextDayOfMonth } from "./dates";
import { postTxn } from "./ledger";
import { msbValue } from "./value";

/** Ghi chú giao dịch rút tiền tất toán về tài khoản chính. */
export const SETTLE_NOTE = " — chuyển về tài khoản chính";

/** Ngày tất toán "kỳ tới": tiền gửi có kỳ hạn chưa đáo hạn thì ngày đáo hạn, còn lại ngày 1 tháng sau. */
export function nextSettleDate(asset: MsbAsset, today: ISODate): ISODate {
  if (asset.category === "term_deposit" && asset.maturityDate && asset.maturityDate > today) return asset.maturityDate;
  return nextDayOfMonth(today, 1);
}

/**
 * Tất toán một khoản đầu tư MSB: bán theo giá trị hiện tại (không phí) rồi rút toàn bộ về tài khoản chính (mutates).
 * Trả về số tiền đã rút.
 */
export function settleToMain(draft: WorldState, goal: Goal, asset: MsbAsset, date: ISODate): number {
  const value = Math.round(msbValue(asset, date, draft.market.fundPriceShiftPct));
  asset.status = "sold";
  asset.value = value;
  asset.valuationDate = date;
  asset.settleOn = undefined;
  if (value > 0) {
    postTxn(draft, goal, "divest", value, date, `Tất toán ${asset.name}`);
    postTxn(draft, goal, "withdraw", value, date, `Tất toán ${asset.name}${SETTLE_NOTE}`);
    draft.customer.mainCasaBalance += value;
  }
  return value;
}
