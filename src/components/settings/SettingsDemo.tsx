"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Bell, Check, ChevronRight, Eye, EyeOff, FileCheck2, FileText, Headphones, Languages, LayoutGrid, LockKeyhole, LogOut, Palette, PenLine, ShieldCheck, Smartphone, Wallet, CircleHelp, KeyRound } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { usePersona } from "@/providers/context";
import { LOGIN_DISPLAY_NAME } from "@/components/login/LoginGate";
import { getConsent, revokeConsent, type ConsentScope } from "@/lib/consent";
import { useSettingsDemo } from "./SettingsDemoContext";
import { Action, Badge, Notice, Panel, Row, Toggle } from "./settings-ui";

import { isShieldSection, type SettingsSection } from "./settings-sections";
import { SHIELD_TITLES } from "./security/shield-copy";
import { ShieldSection } from "./security/ShieldSection";
import { settingsParent } from "@/lib/navigation-direction";
const TITLES: Record<SettingsSection, string> = { ...SHIELD_TITLES, profile: "Thông tin cá nhân", security: "Bảo mật", pin: "Đổi mã PIN xác thực", password: "Đổi mật khẩu", face: "Xác thực khuôn mặt", advanced: "Xác thực nâng cao", questions: "Thiết lập câu hỏi bảo mật", devices: "Quản lý thiết bị truy cập", signature: "Chữ ký số", accounts: "Tài khoản và hạn mức", notifications: "Thông báo", appearance: "Giao diện", widgets: "Cài đặt Widget", language: "Ngôn ngữ", support: "Trung tâm hỗ trợ", privacy: "Quyền dữ liệu", knowledge: "Kiến thức bảo mật hữu ích" };
const QUESTIONS = ["Thương hiệu đồ uống mà bạn yêu thích?", "Món ăn mà người thân trong gia đình bạn yêu thích nhất?", "Địa điểm du lịch mà bạn thích nhất?", "Tên quyển sách mà bạn thấy ấn tượng nhất?", "Tên người bạn mà bạn tin tưởng nhất?", "Bệnh viện nơi bạn được sinh ra?", "Tên người có ảnh hưởng nhất đến bạn?", "Chương trình truyền hình mà bạn thường xuyên xem nhất?", "Màu sắc mà bạn yêu thích nhất?", "Ngày sinh của người bạn yêu quý nhất trong gia đình?"];
const FAQ = ["Xác thực nâng cao bằng câu hỏi bảo mật là gì?", "Tôi có thể tiếp tục thực hiện giao dịch nếu trả lời sai câu hỏi bảo mật không?", "Tôi cần làm gì nếu chức năng Xác thực nâng cao bằng câu hỏi bảo mật bị khóa?"];
const ANSWERS = ["Bạn chọn 3 câu hỏi bảo mật và thiết lập câu trả lời. Trong luồng giả lập, đây là một bước xác nhận bổ sung cho các giao dịch bạn lựa chọn. Chức năng này không thay thế các phương thức xác thực bắt buộc.", "Trong ứng dụng thật, việc tiếp tục giao dịch phụ thuộc vào phương thức xác thực và trạng thái tài khoản. Bản giả lập chỉ mô phỏng giao diện, không xác thực hoặc thực hiện giao dịch ngân hàng.", "Liên hệ trung tâm hỗ trợ qua kênh chính thức của ngân hàng. Không cung cấp mật khẩu, mã PIN hoặc mã OTP cho người khác."];

function SecretField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="mb-5 block"><span className="mb-2 block text-sm font-medium">{label}</span><span className="settings-input flex items-center"><input aria-label={label} type={visible ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? label} autoComplete="off" className="min-w-0 flex-1 bg-transparent outline-none" /><button type="button" aria-label={`${visible ? "Ẩn" : "Hiện"} ${label.toLowerCase()}`} onClick={() => setVisible(!visible)} className="flex h-10 w-10 items-center justify-center">{visible ? <EyeOff size={22} /> : <Eye size={22} />}</button></span></label>;
}

export function SettingsDemo({ section }: { section?: SettingsSection }) {
  const { persona } = usePersona();
  const demo = useSettingsDemo();
  const [sheet, setSheet] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [faq, setFaq] = useState<number | null>(null);
  const [scopes, setScopes] = useState<ConsentScope[]>([]);
  useEffect(() => { setScopes(getConsent()?.scopes ?? []); }, []);
  const name = LOGIN_DISPLAY_NAME[persona.cif] ?? persona.label.split(" — ")[0];
  const href = (target: SettingsSection) => `/settings/${target}`;
  const finish = (message: string) => setFeedback(message);

  let content: ReactNode;
  if (!section) {
    content = <>
      <Link href={href("profile")} className="settings-profile">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/msb-avatar.png" alt="" className="h-12 w-12 rounded-full border-2 border-white shadow-sm" />
        <span className="min-w-0 flex-1"><strong className="block text-base uppercase">{name}</strong><span className="mt-1 block text-sm font-medium text-primary">{persona.tier}</span></span><ChevronRight size={25} />
      </Link>
      <Panel>
        <Row label="Bảo mật" icon={LockKeyhole} href={href("security")} />
        <Row label="Tài khoản và hạn mức" icon={Wallet} href={href("accounts")} />
        <Row label="Thông báo" icon={Bell} href={href("notifications")} />
        <Row label="Giao diện" icon={Palette} href={href("appearance")} />
        <Row label="Cài đặt Widget" icon={LayoutGrid} href={href("widgets")} />
        <Row label="Ngôn ngữ" icon={Languages} href={href("language")} trailing={<span aria-label="Tiếng Việt">🇻🇳</span>} />
      </Panel>
      <Panel><Row label="Trung tâm hỗ trợ" icon={Headphones} href={href("support")} /></Panel>
      <Panel><Row label="Đăng xuất" icon={LogOut} onClick={() => setSheet("logout")} /></Panel>
      <Link href={href("privacy")} className="block text-center text-xs text-muted underline underline-offset-4">Quyền dữ liệu & trợ lý AI</Link>
    </>;
  } else if (section === "security") {
    content = <>
      <Panel><div className="py-6 text-center"><SecurityGauge high={demo.advanced} /><p className="mt-3 text-sm leading-relaxed">Hoàn tất thêm các thiết lập khác để đạt mức bảo mật cao nhất</p></div>
        <Row label="Mã PIN" href={href("pin")} detail="Dùng để đăng nhập và xác thực giao dịch" trailing={<Badge good>Đã thiết lập</Badge>} />
        <div className="settings-row"><span className="flex-1"><strong>Sinh trắc học Face ID</strong><span className="mt-1 block text-sm text-muted">Xác thực nhanh chóng trên thiết bị</span></span><Toggle label="Sinh trắc học Face ID" checked={demo.faceId} onChange={() => demo.update({ faceId: !demo.faceId })} /></div>
        <Row label="Mật khẩu" href={href("password")} trailing={<Badge good={demo.passwordUpdated}>{demo.passwordUpdated ? "Đã cập nhật" : "Đã hết hạn"}</Badge>} />
        <Row label="Xác thực khuôn mặt" href={href("face")} detail="Dùng cho giao dịch giá trị lớn và cài đặt quan trọng" trailing={<Badge good>Đã xác minh</Badge>} />
        <Row label="Xác thực nâng cao" href={href("advanced")} detail="Thêm lớp xác thực câu hỏi bảo mật khi giao dịch" trailing={<Badge good={demo.advanced}>{demo.advanced ? "Đã thiết lập" : "Chưa thiết lập"}</Badge>} />
      </Panel>
      <Panel title="Thiết lập khác"><Row label="Quản lý thiết bị truy cập" icon={Smartphone} href={href("devices")} /><Row label="Chữ ký số" icon={PenLine} href={href("signature")} /></Panel>
      <Panel><Row label="Kiến thức bảo mật hữu ích" icon={CircleHelp} href={href("knowledge")} detail="Trang bị kiến thức để bảo vệ tài sản" /></Panel>
    </>;
  } else if (section === "pin" || section === "password") {
    content = <CredentialForm kind={section} onSuccess={() => { if (section === "password") demo.update({ passwordUpdated: true }); finish(`Đã cập nhật ${section === "pin" ? "mã PIN" : "mật khẩu"} trong luồng giả lập. Thông tin đăng nhập demo không thay đổi.`); }} onForgot={() => setSheet("forgot")} />;
  } else if (section === "face") {
    content = <><Panel><div className="flex items-center justify-between py-4"><strong>Trạng thái</strong><Badge good>Đã xác minh</Badge></div></Panel><Notice><strong className="text-blue-600">Thông tin thêm</strong><ul className="mt-3 list-disc space-y-4 pl-4"><li>Xác thực khuôn mặt áp dụng cho chuyển tiền, thanh toán giá trị cao và các cài đặt quan trọng.</li><li>Nhìn thẳng vào camera, đảm bảo khuôn mặt rõ nét và đủ ánh sáng.</li>Trạng thái trong màn này là dữ liệu demo. Bản giả lập không mở camera hoặc thu thập khuôn mặt.</ul></Notice></>;
  } else if (section === "advanced") {
    content = <><Panel><div className="py-7 text-center"><ShieldCheck size={100} className="mx-auto mb-6 text-orange-400" /><h2 className="font-bold">Tăng cường bảo mật cho giao dịch quan trọng</h2><p className="mt-2 text-sm leading-relaxed">Thêm một lớp xác thực cá nhân hóa bằng câu hỏi bảo mật để bảo vệ tài sản của quý khách</p>{demo.advanced && <div className="mt-4"><Badge good>Đã thiết lập trong giả lập</Badge></div>}</div></Panel><Panel title="Câu hỏi thường gặp">{FAQ.map((q, i) => <Row key={q} label={q} onClick={() => setFaq(i)} />)}</Panel><Link className="settings-action" href={href("questions")}>{demo.advanced ? "Thiết lập lại" : "Bắt đầu thiết lập"}</Link></>;
  } else if (section === "questions") {
    content = <QuestionForm onSuccess={() => { demo.update({ advanced: true }); finish("Đã thiết lập câu hỏi bảo mật trong giả lập. Câu trả lời không được lưu."); }} />;
  } else if (section === "devices") {
    content = <>{["Apple iPhone 14 Plus", "Apple iPhone 14 Plus", "Apple iPhone 11"].map((device, i) => <Panel key={i}><div className="flex items-center gap-3 py-5"><Smartphone size={25} /><div className="flex-1"><strong>{device}</strong><p className="mt-2 text-sm text-muted">{i === 0 ? "Thiết bị hiện tại" : "Lần truy cập trước"} · Dữ liệu demo</p></div>{i === 0 ? <Badge good>Hoạt động</Badge> : <button className="text-sm text-primary" onClick={() => setSheet("device")}>Chi tiết</button>}</div></Panel>)}</>;
  } else if (section === "signature") {
    content = <Panel><Row label="Đăng ký chữ ký số" icon={FileCheck2} onClick={() => setSheet("signature-register")} /><Row label="Ký số tài liệu" icon={PenLine} onClick={() => setSheet("signature-sign")} /><Row label="Lịch sử ký số" icon={FileText} onClick={() => setSheet("signature-history")} /></Panel>;
  } else if (section === "profile") {
    content = <Panel title="Thông tin khách hàng"><Data label="Họ và tên" value={name} /><Data label="Hạng khách hàng" value={persona.tier} /><Data label="Mã khách hàng demo" value={persona.cif} /><p className="py-4 text-sm text-muted">Hồ sơ mẫu đang được chọn trong bản giả lập.</p></Panel>;
  } else if (section === "accounts") {
    content = <><Panel><Row label="Danh sách tài khoản" icon={Wallet} href="/accounts" /><Row label="Hạn mức chuyển tiền" detail="Hạn mức demo, không áp dụng cho tài khoản thật" onClick={() => setSheet("limits")} /></Panel><Panel title="Hạn mức đang mô phỏng"><Data label="Mỗi giao dịch" value="100.000.000 VND" /><Data label="Mỗi ngày" value="500.000.000 VND" /></Panel></>;
  } else if (section === "notifications") {
    content = <><Panel title="Tùy chọn thông báo">{([ ["balanceNotifications", "Biến động số dư"], ["offers", "Ưu đãi và chương trình mới"] ] as const).map(([key, label]) => <div className="settings-row" key={key}><span className="flex-1 font-semibold">{label}</span><Toggle label={label} checked={demo[key]} onChange={() => demo.update({ [key]: !demo[key] })} /></div>)}</Panel><Notice>Các lựa chọn chỉ thay đổi trạng thái trong phiên giả lập; không đăng ký gửi SMS hoặc thông báo thiết bị.</Notice></>;
  } else if (section === "appearance") {
    content = <Panel title="Chọn giao diện">{([ ["anniversary", "MSB · Kỷ niệm", "Nền hồng nhạt theo ảnh tham chiếu"], ["simple", "Đơn giản", "Nền sáng, tập trung vào nội dung"] ] as const).map(([value, label, detail]) => <Row key={value} label={label} detail={detail} onClick={() => demo.update({ appearance: value })} trailing={demo.appearance === value ? <Check className="text-primary" size={20} /> : undefined} />)}<p className="pb-4 text-xs text-muted">Xem trước giao diện trong phần Cài đặt.</p></Panel>;
  } else if (section === "widgets") {
    content = <><Panel title="Widget truy cập nhanh">{["Số dư tài khoản", "Chuyển tiền", "Quét QR"].map(label => <div className="settings-row" key={label}><span className="flex-1 font-semibold">{label}</span><Toggle label={label} checked={demo.widgets.includes(label)} onChange={() => demo.update({ widgets: demo.widgets.includes(label) ? demo.widgets.filter(x => x !== label) : [...demo.widgets, label] })} /></div>)}</Panel><Notice>Đây là bản xem trước cấu hình Widget. Bản giả lập web không cài Widget lên màn hình điện thoại.</Notice></>;
  } else if (section === "language") {
    content = <Panel><Row label="Tiếng Việt" trailing={<Check className="text-primary" size={20} />} onClick={() => finish("Tiếng Việt đang được sử dụng.")} /><Row label="English" detail="Chưa có trong bản giả lập" onClick={() => finish("Bản giả lập hiện hỗ trợ Tiếng Việt.")} /></Panel>;
  } else if (section === "privacy") {
    content = <><Panel title="Dữ liệu đã cho phép">{scopes.map(scope => <Data key={scope} label={{ transactions: "Giao dịch", assets: "Tài sản", liabilities: "Khoản nợ", ai: "Trợ lý AI" }[scope]} value="Đã cho phép" />)}<button className="settings-action mb-4" onClick={() => setSheet("revoke")}>Thu hồi đồng ý</button></Panel><Notice>MSB Financial Copilot dùng dữ liệu minh họa. Các màn bảo mật trong Cài đặt mô phỏng app MSB, không thay đổi xác thực ngân hàng thật.</Notice></>;
  } else if (isShieldSection(section)) {
    content = <ShieldSection section={section} />;
  } else {
    content = <><Panel title={section === "support" ? "Chúng tôi có thể giúp gì cho bạn?" : "Bảo vệ tài khoản của bạn"}><Row label="Không chia sẻ mã OTP, PIN hoặc mật khẩu" icon={LockKeyhole} onClick={() => setSheet("safety")} /><Row label="Kiểm tra thiết bị truy cập" icon={Smartphone} href={href("devices")} /><Row label="Quyền dữ liệu và trợ lý AI" icon={ShieldCheck} href={href("privacy")} /></Panel>{section === "support" && <Notice>Đây là trung tâm hỗ trợ mô phỏng. Khi cần hỗ trợ tài khoản thật, hãy sử dụng các kênh chính thức trong app MSB.</Notice>}</>;
  }

  return <div className={`settings-demo ${demo.appearance === "simple" ? "settings-simple" : ""}`}>
    <header className="settings-header">{section && <Link href={settingsParent(`/settings/${section}`) ?? "/settings"} aria-label="Quay lại" className="flex h-11 w-9 items-center"><ArrowLeft size={24} /></Link>}<h1 className="text-xl font-bold">{section ? TITLES[section] : "Cài đặt"}</h1></header>
    {section && <p className="mb-4 text-xs text-muted">Giả lập MSB · Chỉ dùng thông tin mẫu</p>}
    <div className="flex flex-col gap-5">{content}</div>
    <Sheet open={faq !== null} title="Câu hỏi thường gặp" onClose={() => setFaq(null)}>{faq !== null && <><h3 className="mb-4 font-semibold">{FAQ[faq]}</h3><p className="pb-6 text-sm leading-relaxed">{ANSWERS[faq]}</p></>}</Sheet>
    <Sheet open={!!feedback} title="Thông báo" onClose={() => setFeedback(null)}>{feedback && <><p className="mb-5 text-sm leading-relaxed" role="status">{feedback}</p><Action onClick={() => setFeedback(null)}>Đã hiểu</Action></>}</Sheet>
    <Sheet open={!!sheet} title={sheet === "logout" ? "Đăng xuất" : sheet === "revoke" ? "Thu hồi đồng ý" : "Thông tin"} onClose={() => setSheet(null)}>
      <p className="mb-5 text-sm leading-relaxed">{sheet === "logout" ? "Bạn có muốn đăng xuất khỏi phiên giả lập hiện tại? Dữ liệu tài chính được giữ lại." : sheet === "revoke" ? "Thu hồi quyền sử dụng dữ liệu và quay về màn hình giới thiệu?" : sheet === "forgot" ? "Luồng quên PIN đang được mô phỏng. Hãy quay lại và nhập một mã mẫu gồm 6 chữ số để tiếp tục thử đổi PIN." : sheet === "signature-history" ? "Chưa có tài liệu ký số trong phiên giả lập." : sheet?.startsWith("signature") ? "Chức năng ký số đang được mô phỏng. Không có chứng thư được phát hành hoặc tài liệu được ký thật." : sheet === "limits" ? "Hạn mức hiển thị là số liệu minh họa. Không thay đổi hạn mức ngân hàng thật." : sheet === "device" ? "Đây là thiết bị minh họa trong lịch sử truy cập. Không có phiên đăng nhập thật được thu hồi." : "Chỉ nhập thông tin mẫu khi thử nghiệm. Ngân hàng không yêu cầu bạn chia sẻ mã OTP, PIN hoặc mật khẩu qua tin nhắn."}</p>
      <Action onClick={() => { if (sheet === "logout") { window.localStorage.removeItem("msb-pfm.authenticated"); window.location.assign("/"); } else if (sheet === "revoke") { revokeConsent(); window.location.assign("/onboarding"); } else setSheet(null); }}>{sheet === "logout" ? "Đăng xuất" : sheet === "revoke" ? "Xác nhận thu hồi" : "Đã hiểu"}</Action>
    </Sheet>
  </div>;
}
function Data({ label, value }: { label: string; value: string }) { return <div className="border-b border-border py-4 last:border-0"><p className="text-sm text-muted">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }

function CredentialForm({ kind, onSuccess, onForgot }: { kind: "pin" | "password"; onSuccess: () => void; onForgot: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const pin = kind === "pin";
  const rules = pin ? [/^\d{6}$/.test(next) && !/^(\d)\1{5}$/.test(next) && !["123456", "654321"].includes(next), next.length === 6 && next !== current] : [next.length >= 8, /[A-Z]/.test(next) && /[a-z]/.test(next) && /\d/.test(next) && /[!@#$%^&*]/.test(next), /^[A-Za-z0-9!@#$%^&*]+$/.test(next), next.length > 0 && next !== current];
  const messages = pin ? ["Không dùng số trùng nhau hoặc số liên tiếp (111111, 123456, 654321)", "Không trùng với mã PIN hiện tại"] : ["Độ dài tối thiểu 8 ký tự", "Gồm chữ hoa, chữ thường, số và ký tự đặc biệt !@#$%^&*", "Không bao gồm khoảng trắng và ký tự tiếng Việt", "Không trùng với mật khẩu hiện tại"];
  const valid = (pin ? /^\d{6}$/.test(current) : current.length > 0) && rules.every(Boolean) && next === confirmation;
  function pinField(label: string, value: string, change: (value: string) => void) { return <label className="mb-5 block"><span className="mb-4 block font-medium">{label}</span><span className="relative block rounded-lg focus-within:ring-2 focus-within:ring-orange-300"><input aria-label={label} type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={value} onChange={e => change(e.target.value.replace(/\D/g, ""))} className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0" /><span aria-hidden className="grid grid-cols-6 gap-3">{Array.from({ length: 6 }, (_, i) => <span key={i} className="flex h-11 items-center justify-center rounded-[8px] border border-[#dfe5ee] bg-white text-xl">{value.length > i ? "●" : ""}</span>)}</span></span></label>; }
  return <><Notice>Chỉ nhập PIN hoặc mật khẩu mẫu. Thông tin nhập không được lưu và không thay đổi mật khẩu đăng nhập của bản demo.</Notice><Panel><div className="pt-5">{!pin && <KeyRound size={65} className="mx-auto mb-8 text-orange-400" />}{pin ? pinField("Nhập mã PIN hiện tại", current, setCurrent) : <SecretField label="Mật khẩu hiện tại" value={current} onChange={setCurrent} placeholder="Nhập mật khẩu hiện tại" />}{pin && <button className="mb-5 block w-full text-center text-primary" onClick={onForgot}>Quên mã PIN hiện tại</button>}</div></Panel><Panel><div className="pt-5">{pin ? pinField("Nhập mã PIN mới", next, setNext) : <SecretField label="Mật khẩu mới" value={next} onChange={setNext} placeholder="Nhập mật khẩu mới" />}<ul className="mb-6 space-y-3">{messages.map((text, i) => <li key={text} className="flex gap-2 text-sm leading-relaxed text-muted">{rules[i] ? <Check size={19} className="shrink-0 text-emerald-500" /> : <span className="w-[19px] shrink-0 text-center">•</span>}{text}</li>)}</ul>{pin ? pinField("Xác nhận mã PIN mới", confirmation, setConfirmation) : <SecretField label="Xác nhận mật khẩu mới" value={confirmation} onChange={setConfirmation} placeholder="Nhập lại mật khẩu mới" />}{confirmation && confirmation !== next && <p role="alert" className="mb-4 text-sm text-negative">Thông tin xác nhận chưa khớp.</p>}</div></Panel><Action disabled={!valid} onClick={() => { setCurrent(""); setNext(""); setConfirmation(""); onSuccess(); }}>Cập nhật</Action></>;
}
function QuestionForm({ onSuccess }: { onSuccess: () => void }) {
  const [questions, setQuestions] = useState(["", "", ""]);
  const [answers, setAnswers] = useState(["", "", ""]);
  const [hints, setHints] = useState(["", "", ""]);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [step, setStep] = useState(false);
  const [transactions, setTransactions] = useState(["Chuyển tiền"]);
  const valid = questions.every(Boolean) && new Set(questions).size === 3 && answers.every(a => /^[\x20-\x7E]{5,50}$/.test(a.trim())) && hints.every(h => h.length <= 50);
  const change = (values: string[], index: number, value: string, setter: (values: string[]) => void) => setter(values.map((v, i) => i === index ? value : v));
  if (step) return <><Panel title="Chọn giao dịch áp dụng">{["Chuyển tiền", "Thanh toán", "Cài đặt quan trọng"].map(label => <label key={label} className="settings-row"><span className="flex-1">{label}</span><input type="checkbox" checked={transactions.includes(label)} onChange={() => setTransactions(transactions.includes(label) ? transactions.filter(v => v !== label) : [...transactions, label])} className="h-5 w-5 accent-orange-500" /></label>)}</Panel><Notice>Chỉ lưu trạng thái đã thiết lập trong phiên demo. Câu trả lời và gợi ý sẽ được xóa sau khi hoàn tất.</Notice><Action disabled={!transactions.length} onClick={() => { setAnswers(["", "", ""]); setHints(["", "", ""]); setStep(false); onSuccess(); }}>Xác nhận thiết lập</Action><button className="text-sm text-primary" onClick={() => setStep(false)}>Quay lại câu hỏi</button></>;
  return <><Notice><strong>Lưu ý</strong><p className="mt-2">Dùng câu trả lời mẫu không dấu, từ 5–50 ký tự. Chọn 3 câu hỏi khác nhau. Gợi ý không bắt buộc, tối đa 50 ký tự.</p></Notice>{questions.map((question, i) => <Panel key={i} title={`Câu hỏi bảo mật ${i + 1}`}><div className="pt-5"><label className="mb-5 block"><span className="mb-2 block text-sm font-medium">Câu hỏi</span><button type="button" aria-label={`Chọn câu hỏi ${i + 1}`} onClick={() => setSelecting(i)} className="settings-input flex w-full items-center justify-between gap-2 text-left"><span className={!question ? "text-muted" : ""}>{question || "Chọn câu hỏi"}</span><ChevronRight size={20} className="shrink-0 rotate-90" /></button></label><SecretField label={`Câu trả lời ${i + 1}`} value={answers[i]} onChange={v => change(answers, i, v, setAnswers)} placeholder="Nhập câu trả lời mẫu" /><label className="mb-5 block"><span className="mb-2 block text-sm">Gợi ý câu trả lời (Không bắt buộc)</span><input className="settings-input w-full" value={hints[i]} maxLength={50} onChange={e => change(hints, i, e.target.value, setHints)} placeholder="Nhập gợi ý" /></label></div></Panel>)}<Action disabled={!valid} onClick={() => setStep(true)}>Tiếp tục</Action><Sheet open={selecting !== null} title="Chọn câu hỏi" onClose={() => setSelecting(null)}>{selecting !== null && QUESTIONS.map(q => <button key={q} disabled={questions.some((v, i) => i !== selecting && v === q)} className="block w-full border-b border-border py-4 text-left text-sm leading-relaxed disabled:opacity-35" onClick={() => { change(questions, selecting, q, setQuestions); setSelecting(null); }}>{q}</button>)}</Sheet></>;
}

function SecurityGauge({ high }: { high: boolean }) {
  return <div className="relative mx-auto h-40 max-w-72">
    <svg viewBox="0 0 300 160" className="h-full w-full" aria-hidden="true">
      <path d="M 35 135 A 115 115 0 0 1 265 135" fill="none" stroke="#dfe6ef" strokeWidth="22" strokeLinecap="round" />
      <path d="M 35 135 A 115 115 0 0 1 265 135" fill="none" stroke="#20b779" strokeWidth="22" strokeLinecap="round" pathLength="100" strokeDasharray={high ? "100 100" : "78 100"} />
      <text x="28" y="66" fill="#64748b" fontSize="12" transform="rotate(-52 28 66)">Tiêu chuẩn</text>
      <text x="205" y="37" fill="#64748b" fontSize="12" transform="rotate(33 205 37)">Cao</text>
    </svg>
    <div className="absolute inset-x-0 bottom-2 text-center"><p className="text-sm text-muted">Cấp độ bảo mật</p><p className="mt-1 text-2xl font-bold text-emerald-600">{high ? "Rất cao" : "Cao"}</p></div>
  </div>;
}
