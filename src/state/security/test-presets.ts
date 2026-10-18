// Test-tool presets: ready-made Scam Shield states for testers. Pure, no React.
// Each builds from the defaults it is given, so the caller decides what to keep
// (the panel passes the current alert log so presets never clear it).

import { DAY_MS } from "@/components/settings/security/pending";
import type { EmergencyContact, SecurityState } from "./types";

export type TestPreset = {
  id: "default" | "full" | "no-protect" | "transfer-locked" | "account-locked" | "pending";
  label: string;
  description: string;
  build: (defaults: SecurityState, now: number) => SecurityState;
};

// demo data
const MOTHER: EmergencyContact = { id: "test-emergency-1", name: "Nguyễn Thị Lan", relation: "Mẹ", phone: "0901234567", status: "active" };

// demo data
const full = (defaults: SecurityState): SecurityState => ({
  ...defaults,
  aiProtect: true,
  antiPhishingCode: "SAOMAI",
  emergencyContacts: [MOTHER],
});

export const TEST_PRESETS: TestPreset[] = [
  { id: "default", label: "Mặc định", description: "Như khách mới, chưa đổi gì", build: defaults => ({ ...defaults }) },
  { id: "full", label: "Bảo vệ đầy đủ", description: "M-You bật, mã chống giả mạo, 1 người thân, 3 danh bạ", build: full },
  { id: "no-protect", label: "Đã tắt M-You bảo vệ", description: "Không còn cảnh báo khi chuyển tiền", build: defaults => ({ ...defaults, aiProtect: false, pendingOff: {} }) },
  { id: "transfer-locked", label: "Đang khóa chuyển tiền", description: "Khóa chuyển tiền ra ngoài 1 ngày", build: (defaults, now) => ({ ...defaults, transferLockUntil: now + DAY_MS }) },
  { id: "account-locked", label: "Đang khóa khẩn cấp", description: "Tài khoản bị khóa từ màn Khẩn cấp", build: (defaults, now) => ({ ...defaults, accountLocked: true, accountLockedAt: now }) },
  {
    id: "pending",
    label: "Có yêu cầu đang chờ",
    description: "Bảo vệ đầy đủ, đang chờ 24 giờ để tắt và gỡ người thân",
    build: (defaults, now) => ({
      ...full(defaults),
      pendingOff: { aiProtect: now + DAY_MS, antiPhishing: now + DAY_MS },
      emergencyContacts: [{ ...MOTHER, status: "removing", removeAt: now + DAY_MS }],
    }),
  },
];
