"use client";

import Link from "next/link";
import { CircleHelp, FlaskConical, PenLine, Search, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import { transferNow } from "@/lib/demo-clock";
import { useShallow } from "zustand/react/shallow";
import { useSecurityStore } from "@/state/security/store";
import { effectiveContacts, isTransferLocked } from "@/state/security/selectors";
import { useSettingsDemo } from "../SettingsDemoContext";
import { Badge, Panel, Row, Toggle } from "../settings-ui";
import { SecurityGauge } from "./SecurityGauge";
import { SecurityLoading } from "./SecurityLoading";
import { securityScore } from "./security-score";
import { useScreenEvent } from "@/components/security/useScreenEvent";

const href = (target: string) => `/settings/${target}`;
const timeLabel = (at: number) => new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(at);
const dateLabel = (at: number) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(at);

/** Settings › Bảo mật: score, Scam Shield entry points and the existing auth rows. */
export function SecurityHub() {
  useScreenEvent("hub_open");
  const demo = useSettingsDemo();
  const security = useSecurityStore(useShallow(state => ({ hasHydrated: state.hasHydrated, aiProtect: state.aiProtect, antiPhishingCode: state.antiPhishingCode, emergencyContacts: state.emergencyContacts, trustedContacts: state.trustedContacts, transferLockUntil: state.transferLockUntil, pendingOff: state.pendingOff })));
  if (!security.hasHydrated) return <SecurityLoading />;
  // A contact being removed stays in effect until the 24h wait ends.
  const activeContacts = effectiveContacts(security).length;
  const pendingContacts = security.emergencyContacts.some(contact => contact.status === "pending");
  // Score mixes the old demo auth fields with the Scam Shield store.
  const score = securityScore({ passwordUpdated: demo.passwordUpdated, faceId: demo.faceId, advanced: demo.advanced, aiProtect: security.aiProtect, antiPhishing: security.antiPhishingCode !== null, activeEmergencyContacts: activeContacts, trustedContacts: security.trustedContacts.length });
  const lockUntil = isTransferLocked(security, transferNow().getTime()) ? security.transferLockUntil : null;
  const offAt = security.pendingOff.aiProtect;
  const [first, second] = score.nextSteps;

  return <>
    <Link href={href("scan")} className="flex items-center gap-3 rounded-full border border-border bg-white px-4 py-3">
      <Search size={20} className="shrink-0 text-muted" aria-hidden />
      <span className="flex-1 text-sm text-muted">Kiểm tra tin nhắn, link, số lạ</span>
      <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-strong">Dán</span>
    </Link>
    <Panel><div className="py-6 text-center"><SecurityGauge score={score.total} level={score.level} /><p className="mt-3 text-sm text-muted">Xác thực {score.auth}/50 · Bảo vệ {score.protection}/50</p></div></Panel>
    {first && <section className="settings-panel flex gap-3 p-4">
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white">M</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed">Còn {score.nextSteps.length} bước để lên mức cao hơn: {first.label} (+{first.points}){second && <> và {second.label} (+{second.points})</>}.</p>
        <div className="mt-3 flex flex-wrap gap-2">{score.nextSteps.map(step => <Link key={step.href} href={href(step.href)} className="rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary">{step.cta}</Link>)}</div>
      </div>
    </section>}
    <Panel><Row label="M-You bảo vệ bạn" icon={ShieldCheck} href={href("protect")} detail="Trợ lý AI · Kiểm tra mỗi lệnh chuyển tiền, cảnh báo khi có dấu hiệu lừa đảo" trailing={offAt !== undefined ? <Badge>Tắt lúc {timeLabel(offAt)}</Badge> : <Badge good={security.aiProtect}>{security.aiProtect ? "Đang bật" : "Đang tắt"}</Badge>} /></Panel>
    <Panel title="Xác thực">
      <Row label="Mã PIN" href={href("pin")} detail="Dùng để đăng nhập và xác thực giao dịch" trailing={<Badge good>Đã thiết lập</Badge>} />
      <div className="settings-row"><span className="flex-1"><strong>Sinh trắc học Face ID</strong><span className="mt-1 block text-sm text-muted">Xác thực nhanh chóng trên thiết bị</span></span><Toggle label="Sinh trắc học Face ID" checked={demo.faceId} onChange={() => demo.update({ faceId: !demo.faceId })} /></div>
      <Row label="Mật khẩu" href={href("password")} trailing={<Badge good={demo.passwordUpdated}>{demo.passwordUpdated ? "Đã cập nhật" : "Đã hết hạn"}</Badge>} />
      <Row label="Xác thực khuôn mặt" href={href("face")} detail="Dùng cho giao dịch giá trị lớn và cài đặt quan trọng" trailing={<Badge good>Đã xác minh</Badge>} />
      <Row label="Xác thực nâng cao" href={href("advanced")} detail="Thêm lớp xác thực câu hỏi bảo mật khi giao dịch" trailing={<Badge good={demo.advanced}>{demo.advanced ? "Đã thiết lập" : "Chưa thiết lập"}</Badge>} />
    </Panel>
    <Panel title={<>Bảo vệ nâng cao <span className="ml-1 rounded-full bg-primary px-2 py-0.5 align-middle text-[10px] font-bold text-white">MỚI</span></>}>
      <Row label="Mã chống giả mạo" href={href("anti-phishing")} detail="Hiện trong mọi tin nhắn, email của MSB. Không có mã là giả" trailing={<Badge good={security.antiPhishingCode !== null}>{security.antiPhishingCode !== null ? "Đã bật" : "Chưa bật"}</Badge>} />
      <Row label="Người thân khẩn cấp" href={href("emergency-contacts")} detail="Nhận báo khi bạn gặp cảnh báo Đỏ. Không xem được số dư" trailing={<Badge good={activeContacts > 0}>{activeContacts > 0 ? `${activeContacts} người` : pendingContacts ? "Chờ đồng ý" : "Chưa có"}</Badge>} />
      <Row label="Danh bạ tin cậy" href={href("trusted-contacts")} detail="Chuyển cho người trong danh bạ không bị cảnh báo" trailing={<span className="shrink-0 text-sm text-muted">{security.trustedContacts.length} người</span>} />
      <Row label="Tự khóa chuyển tiền" href={href("transfer-lock")} detail="Tạm khóa chuyển tiền ra ngoài khi bạn muốn" trailing={lockUntil !== null ? <Badge tone="danger">Đang khóa đến {dateLabel(lockUntil)}</Badge> : <Badge tone="neutral">Đang tắt</Badge>} />
    </Panel>
    <Panel title="Thiết lập khác"><Row label="Quản lý thiết bị truy cập" icon={Smartphone} href={href("devices")} /><Row label="Chữ ký số" icon={PenLine} href={href("signature")} /></Panel>
    <Link href={href("sos")} className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-negative bg-white py-3 font-semibold text-negative"><TriangleAlert size={20} aria-hidden />Tôi nghĩ mình bị lừa</Link>
    <Panel><Row label="Kiến thức bảo mật hữu ích" icon={CircleHelp} href={href("knowledge")} detail="Trang bị kiến thức để bảo vệ tài sản" /></Panel>
    {/* Testers: shown in every build, biz test runs a production image. */}
    <Panel><Row label="Công cụ test (demo)" icon={FlaskConical} href={href("test-tools")} detail="Đặt nhanh trạng thái, giờ giả lập, kịch bản chuyển tiền" /></Panel>
  </>;
}
