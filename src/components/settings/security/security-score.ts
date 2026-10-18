// Pure security score for the Settings › Security hub (demo rules, /100).

export type SecurityScoreInput = {
  passwordUpdated: boolean;
  devicesCleared?: boolean;
  faceId: boolean;
  advanced: boolean;
  aiProtect: boolean;
  antiPhishing: boolean;
  activeEmergencyContacts: number;
  trustedContacts: number;
};
export type SecurityLevel = "Rất cao" | "Cao" | "Tiêu chuẩn";
export type SecurityStep = { label: string; points: number; href: string; cta: string };
export type SecurityScore = { total: number; auth: number; protection: number; level: SecurityLevel; nextSteps: SecurityStep[] };

export function securityScore(input: SecurityScoreInput): SecurityScore {
  const hasEmergency = input.activeEmergencyContacts > 0;
  const hasTrusted = input.trustedContacts > 0;
  // PIN (10) and face verification (10) are always set up in the demo.
  const auth = Math.min(50, (input.devicesCleared ? 5 : 0) + 10 + (input.passwordUpdated ? 15 : 0) + 10 + (input.faceId ? 5 : 0) + (input.advanced ? 10 : 0));
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

  return { total, auth, protection, level, nextSteps };
}
