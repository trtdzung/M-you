/** Companion copy for transfers only. No changes to shared FD / Hub copy. */
import { formatVnd } from "@/lib/format";
import type { Intervention } from "./intervention-types";
import type { ScenarioId } from "./scenario-copy";
import { CHANGE_WORDS, shortVnd } from "./scenarios";

export type TransferText = { text: string; emphasis: string[] };
export type TransferDetails = {
  amount?: number;
  recipientName: string;
  recipientBank: string;
  /** Full or masked account; only the last four digits are displayed. */
  recipientAccount: string;
};
export type TransferSafeVariant = "stopped" | "cancelled" | "callback";

export const TRANSFER_LABELS = {
  stopToCall: "Dừng để gọi xác nhận",
  stopToCheck: "Dừng để kiểm tra",
  someoneAsked: "Có người yêu cầu",
  stop: "Dừng giao dịch",
  proceed: "Vẫn chuyển",
  support: "Gọi MSB hỗ trợ",
  cancel: "Hủy giao dịch",
  send: "Chuyển ngay",
  home: "Về trang chủ",
} as const;
export const TRANSFER_SUPPORT_HREF = "/settings/sos";
export const TRANSFER_CLASSIFY = {
  question: "Có ai đang gọi điện hướng dẫn anh/chị không?",
  answers: ["Có", "Không"],
} as const;

const text = (value: string, ...emphasis: string[]): TransferText => ({ text: value, emphasis });

function yellow(id: ScenarioId, name: string): TransferText | null {
  switch (id) {
    case "DH1": return text("Tên này giống người anh/chị từng chuyển, nhưng số tài khoản khác. Kẻ gian hay mượn tên người quen. Anh/chị gọi cho người đó bằng số cũ trước nhé.", "số tài khoản khác");
    case "DH2": return text(`Đây là lần đầu anh/chị chuyển cho ${name}, và số tiền lớn hơn thường lệ. Anh/chị đã biết rõ người này chưa?`, name);
    case "DH3":
    case "DH3-2": {
      const count = id === "DH3-2" ? 2 : 3;
      return text(`Anh/chị đã chuyển cho người này ${count} lần trong 10 phút, lần sau cao hơn lần trước. Có ai đang yêu cầu anh/chị chuyển thêm không?`, `${count} lần trong 10 phút`);
    }
    default: return null;
  }
}

/** Null for a non-yellow scenario. Agent message takes precedence over rule wording. */
export function transferYellowCopy(intervention: Intervention, details: Pick<TransferDetails, "recipientName">): { message: TransferText; action: string } | null {
  const message = yellow(intervention.scenario, details.recipientName);
  if (!message) return null;
  const action = intervention.scenario === "DH1" ? TRANSFER_LABELS.stopToCall
    : intervention.scenario === "DH2" ? TRANSFER_LABELS.stopToCheck : TRANSFER_LABELS.someoneAsked;
  return { message: intervention.source === "agent" ? agentReason(intervention) : message, action };
}

function agentReason(intervention: Intervention): TransferText {
  return { text: intervention.copy.message, emphasis: intervention.copy.emphasis.filter(Boolean) };
}

/** Null if required engine facts are unavailable (e.g. an old stored intervention).
 * Never substitutes the outgoing amount for the savings amount or invents context.
 */
export function transferRedReason(intervention: Intervention, details: Pick<TransferDetails, "recipientName">): TransferText | null {
  if (intervention.source === "agent") return agentReason(intervention);
  const facts = (code: string) => intervention.transferSignals?.find(s => s.code === code)?.facts;
  switch (intervention.scenario) {
    case "DH4": return text("Tài khoản này đã bị người khác báo là lừa đảo.", "lừa đảo");
    case "DH5": {
      const total = facts("T4")?.total;
      return typeof total === "number" && Number.isFinite(total)
        ? text(`Anh/chị vừa tất toán sổ ${shortVnd(total)} và đang chuyển cho người lạ.`, "người lạ") : null;
    }
    case "DH6": return text('Người lạ đã gửi anh/chị một khoản nhỏ, giờ anh/chị chuyển lần thứ 3 với số tiền tăng dần. Đây là cách lừa "làm nhiệm vụ".', '"làm nhiệm vụ"');
    case "DH7": return text("Anh/chị đang chuyển đi gần hết khoản vừa nhận từ tài khoản lạ. Chuyển hộ có thể làm tài khoản của anh/chị bị liên đới.", "tài khoản của anh/chị bị liên đới");
    case "DH-T5": {
      const kinds = facts("T5")?.kinds;
      const changes = typeof kinds === "string" ? kinds.split(",").map(k => CHANGE_WORDS[k]).filter(Boolean) : [];
      return changes.length ? text(`Tài khoản của anh/chị vừa ${changes.join(", ")}, giờ lại chuyển số tiền lớn cho người lạ.`, "người lạ") : null;
    }
    case "DH8": {
      // Same priority and T8 fact interpretation as resolveTransfer / renderDh8.
      const baseId = (["DH1", "DH3", "DH3-2", "DH2"] as const).find(id => intervention.scenarios.includes(id));
      const base = baseId ? yellow(baseId, details.recipientName) : null;
      const t8 = facts("T8");
      if (!base || !t8) return null;
      const context: string[] = [];
      if (t8.night) context.push("giao dịch lúc nửa đêm");
      const words = typeof t8.words === "string" ? t8.words.split(",").filter(Boolean) : [];
      if (words.length) context.push(`nội dung có từ ${words.map(w => `'${w}'`).join(", ")}`);
      if (t8.screenSharing) context.push("đang chia sẻ màn hình");
      return context.length ? { text: `${base.text.replace(/[.?!\s]+$/, "")}. Thêm nữa, ${context.join(", ")}.`, emphasis: base.emphasis } : null;
    }
    default: return null;
  }
}

export const TRANSFER_RED_STEPS = {
  heading: text("Khoan đã, anh/chị.", "Khoan đã, anh/chị."),
  question: "Có ai đang gọi điện hướng dẫn anh/chị chuyển khoản này không?",
  answers: TRANSFER_CLASSIFY.answers,
  yes: {
    message: text("Đây là dấu hiệu lừa đảo. Anh/chị làm theo M-You nhé:", "Đây là dấu hiệu lừa đảo."),
    steps: ["Ngắt cuộc gọi ngay", "Không chuyển tiền", "Gọi MSB để được hỗ trợ"],
    primary: TRANSFER_LABELS.stop,
    secondary: TRANSFER_LABELS.support,
  },
  no: {
    message: text("Cảm ơn anh/chị. Nếu không chắc về người nhận, hãy dừng lại — tiền đã chuyển rất khó lấy lại."),
    primary: TRANSFER_LABELS.stop,
    secondary: TRANSFER_LABELS.proceed,
  },
};

export function transferProceedLabel(seconds: number): string {
  return seconds > 0 ? `${TRANSFER_LABELS.proceed} (${Math.ceil(seconds)} giây)` : TRANSFER_LABELS.proceed;
}

/** Recipient line for red step 1, separate from its reason. */
export function transferRecipientSummary(details: TransferDetails): string {
  const last4 = details.recipientAccount.replace(/\D/g, "").slice(-4);
  return `${details.recipientName} · ${details.recipientBank} ••••${last4}${details.amount === undefined ? "" : ` · ${formatVnd(details.amount)}`}`;
}

export function transferHoldCopy(details: { amount: number; recipientName: string }, remainingMs: number) {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return {
    message: text(`Tiền chưa được chuyển. M-You đang giữ lệnh ${formatVnd(details.amount)} tới ${details.recipientName} trong ${time} để anh/chị có thời gian kiểm tra, theo cài đặt của anh/chị.`, "Tiền chưa được chuyển.", time),
    question: `Trong lúc chờ: ${TRANSFER_CLASSIFY.question.charAt(0).toLowerCase()}${TRANSFER_CLASSIFY.question.slice(1)}`,
    answers: TRANSFER_CLASSIFY.answers,
    yes: { ...TRANSFER_RED_STEPS.yes, primary: TRANSFER_LABELS.cancel },
    primary: TRANSFER_LABELS.cancel,
    secondary: TRANSFER_LABELS.send,
    footnote: 'Hết giờ, anh/chị bấm "Chuyển ngay" nếu vẫn muốn gửi. M-You không tự chuyển.',
  };
}

export function transferSafeCopy(variant: TransferSafeVariant, details: TransferDetails) {
  const headings: Record<TransferSafeVariant, string> = {
    stopped: "Anh/chị đã an toàn. Tiền chưa được chuyển.",
    cancelled: "Đã hủy lệnh. Tiền chưa được chuyển.",
    callback: "MSB sẽ gọi lại cho anh/chị. Tiền chưa được chuyển.",
  };
  const last4 = details.recipientAccount.replace(/\D/g, "").slice(-4);
  return {
    heading: text(headings[variant], headings[variant]),
    summary: `${details.amount === undefined ? "" : `${formatVnd(details.amount)} tới `}${details.recipientName} · ${details.recipientBank} ••••${last4}`,
    message: text('Nếu ai đó gọi lại giục chuyển tiền, đừng nghe theo. MSB không bao giờ yêu cầu chuyển tiền vào "tài khoản an toàn".'),
    primary: TRANSFER_LABELS.home,
    secondary: TRANSFER_LABELS.support,
  };
}
