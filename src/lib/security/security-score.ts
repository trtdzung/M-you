// Pure security score for the Settings › Security hub (demo rules, /100).

export type SecurityScoreInput = {
  pinSet: boolean;
  faceVerified: boolean;
  passwordUpdated: boolean;
  devicesCleared?: boolean;
  faceId: boolean;
  advanced: boolean;
  aiProtect: boolean;
  antiPhishing: boolean;
  activeEmergencyContacts: number;
  trustedContacts: number;
};
export type SecurityScoreItem = { key: string; label: string; points: number; done: boolean };
export type SecurityLevel = "Rất cao" | "Cao" | "Tiêu chuẩn";
export type SecurityStep = { label: string; points: number; href: string; cta: string };
export type SecurityScore = { total: number; auth: number; protection: number; level: SecurityLevel; items: SecurityScoreItem[]; nextSteps: SecurityStep[] };

export function securityScore(input: SecurityScoreInput): SecurityScore {
  const hasEmergency = input.activeEmergencyContacts > 0;
  const hasTrusted = input.trustedContacts > 0;
  // Authentication retains the existing 50-point cap.
  const auth = Math.min(50, (input.devicesCleared ? 5 : 0) + (input.pinSet ? 10 : 0) + (input.passwordUpdated ? 15 : 0) + (input.faceVerified ? 10 : 0) + (input.faceId ? 5 : 0) + (input.advanced ? 10 : 0));
  const protection = (input.aiProtect ? 10 : 0) + (input.antiPhishing ? 15 : 0) + (hasEmergency ? 15 : 0) + (hasTrusted ? 10 : 0);
  const total = auth + protection;
  const level: SecurityLevel = total >= 85 ? "Rất cao" : total >= 60 ? "Cao" : "Tiêu chuẩn";

  // Listed in tie-break order; the stable sort keeps it for equal points.
  const candidates: (SecurityStep & { done: boolean })[] = [
    { done: input.antiPhishing, label: "Mã chống giả mạo", points: 15, href: "anti-phishing", cta: "Bật mã" },
    { done: hasEmergency, label: "Người thân khẩn cấp", points: 15, href: "emergency-contacts", cta: "Thêm người thân" },
    { done: input.passwordUpdated, label: "Đổi mật khẩu", points: 15, href: "password", cta: "Đổi mật khẩu" },
    { done: input.aiProtect, label: "M-You bảo vệ bạn", points: 10, href: "protect", cta: "Bật bảo vệ" },
    { done: input.advanced, label: "Xác thực nâng cao", points: 10, href: "advanced", cta: "Thiết lập" },
    { done: hasTrusted, label: "Danh bạ tin cậy", points: 10, href: "trusted-contacts", cta: "Thêm danh bạ" },
  ];
  const nextSteps = candidates
    .filter(step => !step.done)
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map(({ label, points, href, cta }) => ({ label, points, href, cta }));

  const items: SecurityScoreItem[] = [
    { key: "pinSet", label: "Mã PIN", points: 10, done: input.pinSet },
    { key: "passwordUpdated", label: "Đổi mật khẩu", points: 15, done: input.passwordUpdated },
    { key: "faceVerified", label: "Xác thực khuôn mặt", points: 10, done: input.faceVerified },
    { key: "faceId", label: "Sinh trắc học Face ID", points: 5, done: input.faceId },
    { key: "advanced", label: "Xác thực nâng cao", points: 10, done: input.advanced },
    { key: "devicesCleared", label: "Đăng xuất thiết bị", points: 5, done: !!input.devicesCleared },
    { key: "aiProtect", label: "M-You bảo vệ bạn", points: 10, done: input.aiProtect },
    { key: "antiPhishing", label: "Mã chống giả mạo", points: 15, done: input.antiPhishing },
    { key: "emergencyContacts", label: "Người thân khẩn cấp", points: 15, done: hasEmergency },
    { key: "trustedContacts", label: "Danh bạ tin cậy", points: 10, done: hasTrusted },
  ];
  return { total, auth, protection, level, items, nextSteps };
}
