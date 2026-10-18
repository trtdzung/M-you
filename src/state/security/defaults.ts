// Starting Scam Shield state for a persona with nothing saved yet.

import type { AlertLogEntry, SecurityState, TrustedContact } from "./types";

// Wall-clock time in Vietnam (UTC+7) as ms since epoch.
const vnTime = (month: number, day: number, hour: number, minute: number) => Date.UTC(2026, month - 1, day, hour - 7, minute);

// demo data
const TRUSTED_SAMPLE: TrustedContact[] = [
  { id: "trusted-1", name: "NGUYEN THU HA", bank: "MSB", account: "••• 2291" },
  { id: "trusted-2", name: "TRAN VAN NAM", bank: "Vietcombank", account: "••• 4410" },
  { id: "trusted-3", name: "LE THI MAI", bank: "Techcombank", account: "••• 0835" },
];

// demo data. Dated before the demo clock (15/09, see demo-clock.ts) so new
// warnings, stamped with transferNow(), list above them.
const ALERT_LOG_SAMPLE: AlertLogEntry[] = [
  { id: "alert-demo-1", at: vnTime(9, 12, 22, 24), level: "red", situation: "Vừa tất toán sổ rồi chuyển cho người nhận mới", choice: "Dừng lại" },
  { id: "alert-demo-2", at: vnTime(9, 8, 21, 10), level: "yellow", situation: "Tên giống người quen, khác số tài khoản", choice: "Để tôi gọi" },
  { id: "alert-demo-3", at: vnTime(9, 2, 23, 40), level: "red", situation: "Chuyển khoản lớn lúc nửa đêm, nội dung có chữ \"thuế\"", choice: "Để MSB gọi lại" },
];

export const SECURITY_DEFAULTS: SecurityState = {
  aiProtect: true,
  familyAlerts: true,
  securityTips: true,
  antiPhishingCode: null,
  emergencyContacts: [],
  trustedContacts: TRUSTED_SAMPLE,
  transferLockUntil: null,
  holdEnabled: false,
  holdThreshold: 20_000_000,
  accountLocked: false,
  accountLockedAt: null,
  pendingOff: {},
  alertLog: ALERT_LOG_SAMPLE,
};
