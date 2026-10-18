"use client";

import { useShallow } from "zustand/react/shallow";
import { transferNow } from "@/lib/demo-clock";
import { usePersona } from "@/providers/context";
import { useSecurityStore } from "@/state/security/store";
import { effectiveContacts, isTransferLocked } from "@/state/security/selectors";
import { useTestToolsStore } from "@/state/security/test-tools";
import { useSettingsDemo } from "../../SettingsDemoContext";
import { Panel } from "../../settings-ui";
import { formatPendingAt } from "../pending";
import { securityScore } from "../security-score";

function Line({ label, value }: { label: string; value: string }) {
  return <div className="settings-row"><span className="min-w-0 flex-1 text-sm text-muted">{label}</span><span className="shrink-0 text-right text-sm font-semibold">{value}</span></div>;
}

/** Read-only snapshot of every Scam Shield value a tester may want to check. */
export function StateSummary() {
  const { persona } = usePersona();
  const demo = useSettingsDemo();
  const alertHour = useTestToolsStore(state => state.alertHour);
  const s = useSecurityStore(useShallow(state => ({ aiProtect: state.aiProtect, antiPhishingCode: state.antiPhishingCode, emergencyContacts: state.emergencyContacts, trustedContacts: state.trustedContacts, transferLockUntil: state.transferLockUntil, accountLocked: state.accountLocked, pendingOff: state.pendingOff, alertLog: state.alertLog })));
  const activeContacts = effectiveContacts(s).length;
  const waitingContacts = s.emergencyContacts.filter(contact => contact.status === "pending").length;
  const removing = s.emergencyContacts.filter(contact => contact.status === "removing").length;
  // Same inputs as the Hub, so the score matches it.
  const score = securityScore({ passwordUpdated: demo.passwordUpdated, faceId: demo.faceId, advanced: demo.advanced, aiProtect: s.aiProtect, antiPhishing: s.antiPhishingCode !== null, activeEmergencyContacts: activeContacts, trustedContacts: s.trustedContacts.length });
  const offAt = s.pendingOff.aiProtect;
  const lockUntil = isTransferLocked(s, transferNow().getTime()) ? s.transferLockUntil : null;

  return <Panel title="Trạng thái hiện tại">
    <Line label="Persona" value={persona.cif} />
    <Line label="Điểm bảo mật" value={`${score.total}/100 · ${score.level}`} />
    <Line label="M-You bảo vệ" value={offAt !== undefined ? `Tắt lúc ${formatPendingAt(offAt)}` : s.aiProtect ? "Bật" : "Tắt"} />
    <Line label="Mã chống giả mạo" value={s.antiPhishingCode ?? "Chưa bật"} />
    <Line label="Người thân khẩn cấp" value={`${activeContacts} hoạt động · ${waitingContacts} chờ đồng ý`} />
    <Line label="Danh bạ tin cậy" value={`${s.trustedContacts.length} người`} />
    <Line label="Khóa chuyển tiền" value={lockUntil !== null ? `Đến ${formatPendingAt(lockUntil)}` : "Không"} />
    <Line label="Khóa khẩn cấp" value={s.accountLocked ? "Đang khóa" : "Không"} />
    <Line label="Yêu cầu đang chờ 24 giờ" value={String(Object.keys(s.pendingOff).length + removing)} />
    <Line label="Nhật ký cảnh báo" value={`${s.alertLog.length} dòng`} />
    <Line label="Giờ chấm cảnh báo" value={alertHour === null ? "Theo giờ thật" : `${String(alertHour).padStart(2, "0")}:00 (giả lập)`} />
  </Panel>;
}
