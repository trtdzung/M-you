// One-tap scenario cards for testers. "Mong đợi" is assembled from scenario-copy
// (the spec columns), never reworded here. HOLD quotes the UC10 sentence kept
// in holds.ts plus the diagnostic chips from scenario-copy.

import { HOLD_MINUTES } from "@/lib/security/hold-rules";
import { CLASSIFY_QUESTIONS, DIAGNOSE_ANSWERS, SCENARIO_COPY, type ScenarioId } from "@/lib/security/scenario-copy";
import { CHAIN_RECIPIENT, STRANGER } from "./sim";

export type ScenarioField = { label: string; value: string; copy?: string };
export type ScenarioLevel = "green" | "yellow" | "red";
export type ScenarioGroup = "BT" | "Vàng" | "Đỏ" | "SC" | "Giữ lệnh";

export type ScenarioCardDef = {
  id: string;
  name: string;
  group: ScenarioGroup;
  copyId: ScenarioId | "HOLD";
  level: ScenarioLevel;
  /** Signal codes that mean this card was built correctly. */
  signals: string[];
  href: string;
  fields: ScenarioField[];
};

const copyField = (label: string, value: string): ScenarioField => ({ label, value, copy: value });

/** Spec UC10 (b), the sentence quoted on the hold rule. */
const HOLD_SPEC = "giữ giao dịch khi có bất thường (UC 12): người nhận mới cộng số tiền vượt ngưỡng KH đặt → giữ X phút, KH hủy được. Chuyển cho người trong danh bạ tin cậy thì không bị giữ.";

const SCAN_SAMPLE = "Tin nhắn nhắc chương trình hoàn tiền 2 triệu của MSB. Nhận ngay tại msb-hoantien.com trong 30 phút.";

/** Nội dung + Chip + Màn hiển thị, read from scenario-copy (HOLD from the UC10 sentence). */
export function expectedLine(id: ScenarioId | "HOLD"): string {
  if (id === "HOLD") {
    return `${HOLD_SPEC} · Chip: ${DIAGNOSE_ANSWERS.join(" · ")} · ${CLASSIFY_QUESTIONS.join(" ")} · Giữ ${HOLD_MINUTES} phút`;
  }
  const copy = SCENARIO_COPY[id];
  const seconds = copy.countdownSec !== null ? ` · ${copy.countdownSec} giây` : "";
  return `${copy.content} · Chip: ${copy.chips.join(" · ")} · ${copy.display}${seconds}`;
}

const money = (amount: number): ScenarioField => ({ label: "Số tiền", value: amount.toLocaleString("vi-VN"), copy: String(amount) });

export const SCENARIO_CARDS: ScenarioCardDef[] = [
  {
    id: "BT1", name: "BT1 · KH mới", group: "BT", copyId: "BT1", level: "green", signals: [], href: "/",
    fields: [copyField("Ngày mở tài khoản", "3 ngày trước")],
  },
  {
    id: "BT2", name: "BT2 · Điểm dưới mức Cao", group: "BT", copyId: "BT2", level: "green", signals: [], href: "/settings/security",
    fields: [copyField("Điểm", "Dưới mức Cao")],
  },
  {
    id: "BT3", name: "BT3 · Số dư tăng mạnh", group: "BT", copyId: "BT3", level: "green", signals: [], href: "/",
    fields: [money(120_000_000), copyField("Loại", "Lương"), copyField("Người gửi", EMPLOYER_LABEL())],
  },
  {
    id: "BT4", name: "BT4 · 3 khoản nhỏ từ người lạ", group: "BT", copyId: "BT4", level: "green", signals: ["T7a"], href: "/transactions",
    fields: [copyField("Tiền vào", "3 × 50.000"), copyField("Người gửi", STRANGER.name)],
  },
  {
    id: "BT5", name: "BT5 · Khoản lớn từ người lạ", group: "BT", copyId: "BT5", level: "green", signals: ["T7b"], href: "/transactions",
    fields: [money(30_000_000), copyField("Người gửi", STRANGER.name), copyField("Số tài khoản", STRANGER.account)],
  },
  {
    id: "BT6", name: "BT6 · Cùng người lần thứ 2", group: "BT", copyId: "BT6", level: "green", signals: [], href: "/transfer",
    fields: [copyField("Người nhận", CHAIN_RECIPIENT.name), copyField("Số tài khoản", CHAIN_RECIPIENT.account), copyField("Ngân hàng", CHAIN_RECIPIENT.bank), money(200_000), copyField("Trên màn", "Bấm Xác nhận để tới màn thành công")],
  },
  {
    id: "BT7", name: "BT7 · Quét tin nhắn", group: "BT", copyId: "BT7", level: "green", signals: [], href: "/settings/scan",
    fields: [copyField("Tin nhắn", SCAN_SAMPLE), copyField("Trên màn", "Dán tin rồi bấm Kiểm tra")],
  },
  {
    id: "DH3-2", name: "Vàng · lệnh thứ 2", group: "Vàng", copyId: "DH3-2", level: "yellow", signals: ["T1", "T6"], href: "/transfer",
    fields: payeeFields(CHAIN_RECIPIENT, 200_000, "tien hang"),
  },
  {
    id: "DH1", name: "DH1 · Giả danh người quen", group: "Vàng", copyId: "DH1", level: "yellow", signals: ["T1b"], href: "/transfer",
    fields: payeeFields({ name: "NGUYEN THU HA", account: "0100005678", bank: "MSB" }, 500_000, "tien hang"),
  },
  {
    id: "DH2", name: "DH2 · Số tiền lớn cho người lạ", group: "Vàng", copyId: "DH2", level: "yellow", signals: ["T1", "T3"], href: "/transfer",
    fields: payeeFields(STRANGER, 15_000_000, "tien hang"),
  },
  {
    id: "DH3", name: "DH3 · Lệnh thứ 3", group: "Vàng", copyId: "DH3", level: "yellow", signals: ["T1", "T6"], href: "/transfer",
    fields: payeeFields(CHAIN_RECIPIENT, 500_000, "tien hang"),
  },
  {
    id: "DH4", name: "DH4 · Tài khoản cảnh báo", group: "Đỏ", copyId: "DH4", level: "red", signals: ["T2"], href: "/transfer",
    fields: payeeFields({ name: "TK CANH BAO", account: "9704000000000001", bank: "VietinBank" }, 500_000, "tien hang"),
  },
  {
    id: "DH5", name: "DH5 · Tất toán sổ rồi chuyển", group: "Đỏ", copyId: "DH5", level: "red", signals: ["T1", "T4"], href: "/transfer",
    fields: [...payeeFields(STRANGER, 2_000_000, "tien hang"), copyField("Sổ", "Tất toán từ 50% tiền tiết kiệm")],
  },
  {
    id: "DH6", name: "DH6 · Làm nhiệm vụ", group: "Đỏ", copyId: "DH6", level: "red", signals: ["T1", "T6", "T7a"], href: "/transfer",
    fields: payeeFields(CHAIN_RECIPIENT, 500_000, "tien hang"),
  },
  {
    id: "DH7", name: "DH7 · Chuyển gần hết khoản vừa nhận", group: "Đỏ", copyId: "DH7", level: "red", signals: ["T1", "T7b"], href: "/transfer",
    fields: payeeFields({ name: "LE VAN KHAC", account: "9704777700004321", bank: "ACB" }, 24_000_000, "chuyen tra"),
  },
  {
    id: "DH8-night", name: "DH8 · Giờ (nửa đêm)", group: "Đỏ", copyId: "DH8", level: "red", signals: ["T1", "T3", "T8"], href: "/transfer",
    fields: [...payeeFields(STRANGER, 15_000_000, "tien hang"), copyField("Giờ chấm", "23:00")],
  },
  {
    id: "DH8-words", name: "DH8 · Từ khóa", group: "Đỏ", copyId: "DH8", level: "red", signals: ["T1", "T3", "T8"], href: "/transfer",
    fields: payeeFields(STRANGER, 15_000_000, "nop thue"),
  },
  {
    id: "DH8-screen", name: "DH8 · Chia sẻ màn hình", group: "Đỏ", copyId: "DH8", level: "red", signals: ["T1", "T3", "T8"], href: "/transfer",
    fields: [...payeeFields(STRANGER, 15_000_000, "tien hang"), copyField("Màn hình", "Đang chia sẻ")],
  },
  {
    id: "DH-T5", name: "DH-T5 · Vừa đổi mật khẩu", group: "Đỏ", copyId: "DH-T5", level: "red", signals: ["T1", "T5", "T3"], href: "/transfer",
    fields: payeeFields(STRANGER, 15_000_000, "tien hang"),
  },
  {
    id: "SC1", name: "SC1 · Khóa khẩn cấp", group: "SC", copyId: "SC1", level: "red", signals: [], href: "/settings/sos",
    fields: [copyField("Màn", "Khẩn cấp")],
  },
  {
    id: "SC2", name: "SC2 · Hồ sơ tra soát", group: "SC", copyId: "SC2", level: "red", signals: [], href: "/settings/case",
    fields: [copyField("Màn", "Tra soát")],
  },
  {
    id: "SC3", name: "SC3 · Banner hồ sơ", group: "SC", copyId: "SC3", level: "red", signals: [], href: "/",
    fields: [copyField("Màn", "Home")],
  },
  {
    id: "SC4", name: "SC4 · Phục hồi bảo mật", group: "SC", copyId: "SC4", level: "red", signals: [], href: "/settings/security",
    fields: [copyField("Màn", "Hub Security")],
  },
  {
    id: "HOLD", name: "UC10 · Giữ lệnh", group: "Giữ lệnh", copyId: "HOLD", level: "yellow", signals: ["T1"], href: "/transfer",
    fields: [...payeeFields({ name: "NGUYEN VAN MOI", account: "9704666600007777", bank: "ACB" }, 200_000, "tien hang"), copyField("Trên màn", "Bấm Xác nhận")],
  },
];

function EMPLOYER_LABEL(): string {
  return "CONG TY LUONG";
}

function payeeFields(payee: { name: string; account: string; bank: string }, amount: number, memo: string): ScenarioField[] {
  return [
    copyField("Người nhận", payee.name),
    copyField("Số tài khoản", payee.account),
    copyField("Ngân hàng", payee.bank),
    money(amount),
    copyField("Nội dung", memo),
  ];
}
