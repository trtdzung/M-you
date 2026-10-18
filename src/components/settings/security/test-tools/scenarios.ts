// Transfer scenarios for testers. "Expected" lines follow src/lib/transfer-alert.ts
// (threshold 10 million, Red = name spoof, authority word or 3+ reasons).
// Typed recipients always count as new payees there. All values are demo data.

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

// demo data
export const TRANSFER_SCENARIOS: TransferScenario[] = [
  {
    id: "green", name: "Xanh", level: "green", hour: null,
    fields: [{ label: "Người nhận", value: "NGUYEN THU HA", copy: "NGUYEN THU HA" }, { label: "Số tài khoản", value: "0100002291 (chỉ cần tận cùng 2291)", copy: "0100002291" }, { label: "Số tiền", value: "500.000", copy: "500000" }, { label: "Nội dung", value: "an trua", copy: "an trua" }],
    expected: "Không banner, chuyển ngay, nhật ký không thêm dòng.",
  },
  {
    id: "yellow", name: "Vàng", level: "yellow", hour: 10,
    fields: [NEW_NAME, NEW_ACCOUNT, { label: "Số tiền", value: "2.000.000", copy: "2000000" }, { label: "Nội dung", value: "tien hang", copy: "tien hang" }],
    expected: "Banner vàng \"người nhận mới\", bấm Xác nhận chuyển ngay, nhật ký thêm dòng Vàng.",
  },
  {
    id: "red", name: "Đỏ", level: "red", hour: 10,
    fields: [NEW_NAME, NEW_ACCOUNT, { label: "Số tiền", value: "50.000.000", copy: "50000000" }, { label: "Nội dung", value: "nop thue", copy: "nop thue" }],
    expected: "Sheet \"Khoan đã\" với lý do người nhận mới, số tiền từ 10 triệu, nội dung có chữ \"thuế\"; nút \"Vẫn tiếp tục\" đếm ngược 30 giây.",
  },
  {
    id: "red-night", name: "Đỏ vì giờ khuya", level: "red", hour: 23,
    fields: [NEW_NAME, NEW_ACCOUNT, { label: "Số tiền", value: "15.000.000", copy: "15000000" }, { label: "Nội dung", value: "tra no", copy: "tra no" }],
    expected: "Đỏ với 3 lý do: người nhận mới, số tiền từ 10 triệu, chuyển khoản lúc nửa đêm.",
  },
  {
    id: "spoof", name: "Giả danh người quen", level: "red", hour: null,
    fields: [{ label: "Người nhận", value: "NGUYEN THU HA", copy: "NGUYEN THU HA" }, { label: "Số tài khoản", value: "0100005678 (không tận cùng 2291)", copy: "0100005678" }, { label: "Số tiền", value: "3.000.000", copy: "3000000" }, { label: "Nội dung", value: "Bất kỳ" }],
    expected: "Đỏ, lý do \"Tên giống người quen, khác số tài khoản\".",
  },
];
