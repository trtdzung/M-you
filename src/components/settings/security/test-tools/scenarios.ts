// Transfer scenarios for testers, named after the "AI Agent Fraud" spec (BT/DH).
// "Expected" lines follow src/lib/transfer-alert.ts: Yellow = name spoof (T1b) or
// new payee + unusual amount (T1 + T3); Red = any Yellow + night/keyword (T8).
// T3 here means at least 50% of the source balance (or 3× the largest payment in
// 90 days). Typed recipients always count as new payees. All values are demo data.

export type ScenarioField = { label: string; value: string; copy?: string };
export type TransferScenario = {
  id: string;
  name: string;
  level: "green" | "yellow" | "red";
  fields: ScenarioField[];
  /** Simulated alert hour the scenario needs; null = any hour. */
  hour: number | null;
  expected: string;
};

const NEW_NAME: ScenarioField = { label: "Người nhận", value: "Tên bất kỳ, không trùng danh bạ tin cậy" };
const NEW_ACCOUNT: ScenarioField = { label: "Số tài khoản", value: "Số bất kỳ chưa từng chuyển" };
const BIG_AMOUNT: ScenarioField = { label: "Số tiền", value: "15.000.000 (từ 50% số dư trở lên)", copy: "15000000" };
const FRIEND: ScenarioField = { label: "Người nhận", value: "NGUYEN THU HA", copy: "NGUYEN THU HA" };
const BANK_MSB: ScenarioField = { label: "Ngân hàng", value: "MSB" };

// demo data
export const TRANSFER_SCENARIOS: TransferScenario[] = [
  {
    id: "green-friend", name: "Xanh · người quen", level: "green", hour: null,
    fields: [FRIEND, BANK_MSB, { label: "Số tài khoản", value: "0100002291 (chỉ cần tận cùng 2291)", copy: "0100002291" }, { label: "Số tiền", value: "500.000", copy: "500000" }],
    expected: "Không banner, chuyển ngay, nhật ký không thêm dòng.",
  },
  {
    id: "green-new", name: "Xanh · chỉ người nhận mới", level: "green", hour: 10,
    fields: [NEW_NAME, NEW_ACCOUNT, { label: "Số tiền", value: "2.000.000", copy: "2000000" }, { label: "Nội dung", value: "tien hang", copy: "tien hang" }],
    expected: "Không banner: một tín hiệu Trung bình (người nhận mới) chưa đủ để cảnh báo.",
  },
  {
    id: "dh1", name: "DH1 · Giả danh người quen (Vàng)", level: "yellow", hour: 10,
    fields: [FRIEND, BANK_MSB, { label: "Số tài khoản", value: "0100005678 (không tận cùng 2291)", copy: "0100005678" }, { label: "Số tiền", value: "3.000.000", copy: "3000000" }],
    expected: "Banner vàng với lý do \"tên giống người quen, khác số tài khoản hoặc ngân hàng\". Bấm Xác nhận chuyển ngay, nhật ký thêm dòng Vàng.",
  },
  {
    id: "dh2", name: "DH2 · Số tiền lớn cho người lạ (Vàng)", level: "yellow", hour: 10,
    fields: [NEW_NAME, NEW_ACCOUNT, BIG_AMOUNT, { label: "Nội dung", value: "tien hang", copy: "tien hang" }],
    expected: "Banner vàng: người nhận mới; số tiền từ 50% số dư trở lên.",
  },
  {
    id: "dh8-night", name: "DH8 · Vàng lúc nửa đêm (Đỏ)", level: "red", hour: 23,
    fields: [NEW_NAME, NEW_ACCOUNT, BIG_AMOUNT, { label: "Nội dung", value: "tra no", copy: "tra no" }],
    expected: "Sheet \"Khoan đã\": người nhận mới, số tiền từ 50% số dư, chuyển khoản lúc nửa đêm (23:00–01:00). \"Vẫn tiếp tục\" đếm ngược 30 giây.",
  },
  {
    id: "dh8-word", name: "DH8 · Vàng có từ khóa (Đỏ)", level: "red", hour: 10,
    fields: [NEW_NAME, NEW_ACCOUNT, BIG_AMOUNT, { label: "Nội dung", value: "nop thue (hoặc phat, tai khoan an toan, nhiem vu, gap)", copy: "nop thue" }],
    expected: "Sheet \"Khoan đã\" với lý do nội dung có chữ \"thuế\" cùng người nhận mới và số tiền lớn.",
  },
];
