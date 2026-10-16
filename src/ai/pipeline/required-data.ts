/**
 * Required-data gate. Before answering, confirm the data an intent needs exists.
 * When it does not, ask the user rather than inventing an answer (PFM-072).
 */

import type { AiContext } from "@/ai/server/load-financials";
import type { Intent } from "./intent";

export interface RequiredDataCheck {
  ok: boolean;
  reason?: string;
}

export function checkRequiredData(intent: Intent, ctx: AiContext): RequiredDataCheck {
  switch (intent.kind) {
    case "whatif_goal":
      if (ctx.raw.goals.length === 0) {
        return { ok: false, reason: "Bạn chưa tạo mục tiêu nào nên mình chưa mô phỏng được. Hãy thêm một mục tiêu trước nhé." };
      }
      return { ok: true };
    case "whatif_debt":
      if (ctx.raw.liabilities.length === 0) {
        return { ok: false, reason: "Mình chưa thấy khoản nợ nào trong dữ liệu của bạn để mô phỏng trả nợ." };
      }
      return { ok: true };
    case "networth":
      if (ctx.raw.assets.length === 0 && ctx.raw.liabilities.length === 0) {
        return { ok: false, reason: "Chưa có dữ liệu tài sản/khoản nợ để tính giá trị ròng." };
      }
      return { ok: true };
    default:
      return { ok: true };
  }
}
