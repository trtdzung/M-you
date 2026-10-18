// What a Scam Shield chip or button does. Shared by the server (orchestrator)
// and the confirm screen, which must still act when the engine is unreachable.

import type { RespondAction } from "./intervention-types";

const NAVIGATE: Record<string, string> = {
  "Xem 3 thủ đoạn phổ biến": "/settings/knowledge",
  "Xem thủ đoạn": "/settings/knowledge",
  "Xem thủ đoạn tương tự": "/settings/knowledge",
  "Trung tâm bảo mật": "/settings/security",
  "Bật mã": "/settings/anti-phishing",
  "Thêm người thân": "/settings/emergency-contacts",
  "Tự khóa chuyển tiền": "/settings/transfer-lock",
  "Xem trạng thái hồ sơ": "/settings/case",
  "Làm bước tiếp theo": "/settings/security",
  // BT2 chips are the Hub score steps' own buttons.
  "Đổi mật khẩu": "/settings/password",
  "Bật bảo vệ": "/settings/protect",
  "Thiết lập": "/settings/advanced",
  "Thêm danh bạ": "/settings/trusted-contacts",
};
const PROCEED = new Set(["Đã gọi, tiếp tục", "Đã kiểm tra, tiếp tục", "Tôi tự chuyển", "Tiếp tục", "Vẫn tiếp tục"]);
const STOP = new Set(["Để tôi gọi", "Kiểm tra lại", "Có người yêu cầu → xem thêm", "Dừng lại", "Hủy giao dịch"]);
const EMERGENCY = new Set(["Tôi nghĩ mình bị lừa", "Khóa ngay", "Không phải tôi → khóa ngay"]);

/** What a chip does. Unknown choices only close the intervention. */
export function actionFor(choice: string): RespondAction {
  if (PROCEED.has(choice)) return { kind: "proceed" };
  if (STOP.has(choice)) return { kind: "stop" };
  if (EMERGENCY.has(choice)) return { kind: "emergency" };
  if (choice === "Để MSB gọi lại") return { kind: "callback" };
  if (choice === "Yêu cầu MSB tra soát") return { kind: "case" };
  if (choice === "Lưu vào danh bạ tin cậy") return { kind: "trust" };
  if (NAVIGATE[choice]) return { kind: "navigate", href: NAVIGATE[choice] };
  return { kind: "dismiss" };
}
