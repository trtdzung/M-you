"use client";

import { useState } from "react";
import { ArrowUpRight, Bell, ChevronDown, Eye, EyeOff, Headphones, QrCode, ScanFace, ScanLine, UserRound } from "lucide-react";
import { PhoneShell } from "@/components/shell/PhoneShell";
import { Sheet } from "@/components/primitives";
import { PromoCarousel } from "@/components/home/PromoCarousel";
import { PromoCard } from "@/components/home/PromoCard";
import { validateLogin, type LoginCustomer } from "@/lib/auth";

function AnniversaryHero() {
  return (
    <div className="login-anniversary" aria-label="MSB · Vươn tầm từ di sản · 35 năm">
      <svg viewBox="0 0 400 270" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {[ [45, 90, 32], [180, 30, 20], [300, 65, 17], [350, 180, 16] ].map(([x, y, radius], index) => (
          <g key={index} stroke="#ffd278" opacity="0.5">
            {Array.from({ length: 16 }, (_, ray) => <line key={ray} x1={x} y1={y - 5} x2={x} y2={y - radius} transform={`rotate(${ray * 22.5} ${x} ${y})`} />)}
          </g>
        ))}
        <g fill="#ffb24d" opacity="0.22">
          {Array.from({ length: 18 }, (_, i) => <rect key={i} x={i * 24 - 4} y={205 - (i * 37 % 65)} width={19} height={100} />)}
        </g>
      </svg>
      <span className="login-heritage">VƯƠN TẦM<br /><small>TỪ</small> DI SẢN</span>
      <span className="login-years">35</span>
      <span className="login-year-label">NĂM</span>
    </div>
  );
}

/** MSB pre-login landing. Password verification remains in the existing demo gate. */
export function LoginScreen<T extends LoginCustomer>({ customers, initialCif = "", onLogin }: {
  customers: T[];
  initialCif?: string;
  onLogin: (customer: T) => void;
}) {
  const [cif, setCif] = useState(initialCif);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<"login" | "personal-qr" | "qr" | "support" | "language" | "notifications" | null>(null);
  const [transfer, setTransfer] = useState(false);
  const customer = customers.find(c => c.cif === cif);

  function closeSheet() {
    setSheet(null);
    setPassword("");
    setShowPassword(false);
    setError("");
  }
  function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    const result = validateLogin(cif, password, customers);
    if (!result.ok) { setError(result.error); return; }
    setError("");
    setPassword("");
    onLogin(result.customer);
  }

  return (
    <PhoneShell className="login-shell" background={<div aria-hidden className="login-background absolute inset-0 -z-10" />} mainClassName="shell-main--login">
      <div className="pb-8">
        <header className="login-topbar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/msb-logo-white.png" alt="MSB" className="h-9 w-auto" />
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Thông báo" className="login-icon-button" onClick={() => setSheet("notifications")}><Bell size={25} /></button>
            <button type="button" aria-label="Ngôn ngữ" className="flex h-11 items-center gap-2 rounded-[10px] bg-[#fff3eb] px-3 text-sm font-semibold text-text" onClick={() => setSheet("language")}>VN <ChevronDown size={17} /></button>
          </div>
        </header>
        <AnniversaryHero />
        <section className="login-welcome" aria-label="Đăng nhập khách hàng">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-sm text-muted">Chào mừng trở lại,</p>
              <div className="relative rounded-lg focus-within:ring-2 focus-within:ring-orange-400">
                <span aria-hidden className="flex items-center gap-3 text-lg font-bold text-[#10284b]"><span className="truncate">{customer?.label ?? "Chọn khách hàng"}</span><UserRound size={24} className="shrink-0" /></span>
                <select aria-label="Khách hàng" value={cif} onChange={e => { setCif(e.target.value); setError(""); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
                  <option value="" disabled>Chọn khách hàng</option>
                  {customers.map(c => <option key={c.cif} value={c.cif}>{c.label} · {c.cif}</option>)}
                </select>
              </div>
            </div>
            <button type="button" aria-label="QR cá nhân" onClick={() => setSheet("personal-qr")} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-orange-300 bg-white/40 text-[#10284b]"><QrCode size={37} /></button>
          </div>
          <button type="button" onClick={() => { setTransfer(false); setSheet("login"); }} className="login-submit"><ScanFace size={24} aria-hidden />Đăng nhập</button>
        </section>
        <section aria-label="Truy cập nhanh" className="login-shortcuts">
          <button type="button" onClick={() => { setTransfer(true); setSheet("login"); }}><ArrowUpRight size={31} /><span>Chuyển tiền</span></button>
          <button type="button" onClick={() => setSheet("qr")}><ScanLine size={31} /><span>Quét QR</span></button>
          <button type="button" onClick={() => setSheet("support")}><Headphones size={31} /><span>Hỗ trợ</span></button>
        </section>
        <PromoCarousel items={[
          <PromoCard key="family" variant="image" image="/brand/banner-family.jpg" imageAlt="Ưu đãi thẻ MSB" />,
          <PromoCard key="savings" variant="image" image="/brand/banner-savings.jpg" imageAlt="Ưu đãi tiết kiệm" />,
          <PromoCard key="business" variant="image" image="/brand/banner-business.jpg" imageAlt="Ưu đãi doanh nghiệp" />,
        ]} />
      </div>
      {sheet === "login" && <Sheet title="Đăng nhập" description={transfer ? "Vui lòng đăng nhập trước khi sử dụng Chuyển tiền." : "Sử dụng mật khẩu demo để vào ứng dụng."} onClose={closeSheet}>
        <form onSubmit={handleLogin} className="pb-3">
          <p className="mb-4 text-sm font-semibold text-text">{customer?.label ?? "Vui lòng chọn khách hàng ở màn hình đăng nhập"}</p>
          <label className="mb-2 block text-sm font-medium" htmlFor="login-password">Mật khẩu</label>
          <div className="relative mb-3">
            <input id="login-password" type={showPassword ? "text" : "password"} value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder="Nhập mật khẩu" autoComplete="off" aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} className="h-12 w-full rounded-[10px] border border-border bg-surface-muted px-3 pr-12 text-base outline-none focus:ring-2 focus:ring-orange-300" />
            <button type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPassword(v => !v)} className="absolute right-1 top-0 flex h-12 w-11 items-center justify-center text-muted">{showPassword ? <EyeOff size={21} /> : <Eye size={21} />}</button>
          </div>
          {error && <p id="login-error" role="alert" className="mb-4 text-sm text-negative">{error}</p>}
          <button type="submit" className="login-submit">Đăng nhập</button>
          <button type="button" onClick={() => { setPassword(""); setError(""); setSheet("support"); }} className="mt-4 flex min-h-11 w-full items-center justify-center text-sm font-semibold text-primary">Hỗ trợ đăng nhập</button>
        </form>
      </Sheet>}
      {sheet && sheet !== "login" && <Sheet title={{ "personal-qr": "QR cá nhân", qr: "Quét QR", support: "Hỗ trợ", language: "Ngôn ngữ", notifications: "Thông báo" }[sheet]} onClose={closeSheet}>
        {sheet === "personal-qr" ? <div className="pb-4 text-center"><QrCode size={120} className="mx-auto mb-4 text-text" /><p className="font-semibold">{customer?.label}</p><p className="mt-2 text-sm text-muted">QR minh hoạ cho hồ sơ demo, không dùng để nhận tiền.</p></div> : sheet === "qr" ? <div className="pb-4 text-center"><div className="mx-auto mb-5 flex h-40 w-40 items-center justify-center rounded-[20px] border-2 border-dashed border-orange-300 bg-orange-50"><ScanLine size={80} className="text-primary" /></div><p className="text-sm leading-relaxed text-muted">Khung quét QR mô phỏng. Bản demo không mở camera hoặc thực hiện thanh toán.</p></div> : sheet === "support" ? <div className="space-y-4 pb-4 text-sm leading-relaxed"><p>Chọn tên khách hàng trên thẻ chào mừng để đổi hồ sơ demo, sau đó bấm Đăng nhập và nhập mật khẩu demo đang dùng.</p><p className="text-muted">Bản giả lập không kết nối tài khoản ngân hàng thật. Không nhập thông tin đăng nhập ngân hàng của bạn.</p><button type="button" className="login-submit" onClick={() => setSheet("login")}>Quay lại đăng nhập</button></div> : sheet === "language" ? <div className="pb-4"><button type="button" className="flex min-h-12 w-full items-center justify-between text-sm font-semibold" onClick={closeSheet}>🇻🇳 Tiếng Việt <span className="text-primary">Đang sử dụng</span></button><p className="mt-3 text-xs text-muted">Bản giả lập hiện hỗ trợ Tiếng Việt.</p></div> : <p className="pb-5 text-sm text-muted">Bạn chưa có thông báo mới. Đăng nhập để xem thông báo tài khoản.</p>}
      </Sheet>}
    </PhoneShell>
  );
}
