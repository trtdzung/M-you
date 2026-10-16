"use client";

import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  CreditCard,
  Eye,
  EyeOff,
  Landmark,
  Phone,
  Ticket,
} from "lucide-react";
import { PhoneShell } from "@/components/shell/PhoneShell";
import { PromoCarousel } from "@/components/home/PromoCarousel";
import { PromoCard } from "@/components/home/PromoCard";
import { validateLogin, type LoginCustomer } from "@/lib/auth";

/** Same photo background as Trang chủ (`FestiveBg`) — one shared brand surface across the app. */
function LoginBg() {
  return (
    <>
      <div aria-hidden className="absolute inset-0 -z-10 bg-[url('/bg-2-9.png')] bg-cover bg-top" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent to-black/20" />
    </>
  );
}

/** Decorative-only — this prototype has no branch locator, help center, or hotline flow. */
const QUICK_LINKS = [
  { label: "ATM/Chi nhánh", icon: Landmark },
  { label: "Hướng dẫn", icon: BookOpen },
  { label: "Gọi tổng đài", icon: Phone },
] as const;

/**
 * Prototype login screen: pick one of the sample customers (CIF_0001..0003)
 * and enter the shared demo password. Not real authentication — `LoginGate`
 * is the actual boundary; this component only validates the form and reports
 * the chosen customer up via `onLogin`.
 */
export function LoginScreen<T extends LoginCustomer>({
  customers,
  onLogin,
}: {
  customers: T[];
  onLogin: (customer: T) => void;
}) {
  const [cif, setCif] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function handleLogin() {
    const result = validateLogin(cif, password, customers);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    onLogin(result.customer);
  }

  return (
    <PhoneShell background={<LoginBg />} mainClassName="shell-main--login">
      <div className="flex min-h-full flex-col">
        <div className="flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/msb-logo-white.png" alt="MSB" className="h-7 w-auto" />
          <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2.5 py-1 text-xs font-semibold text-white">
            VN <ChevronDown size={12} />
          </span>
        </div>

        <div className="h-[190px] shrink-0" aria-hidden />

        <div className="flex flex-1 flex-col gap-4 pb-6">
          <div className="shadow-card rounded-[26px] bg-surface p-5">
            <h1 className="mb-4 text-lg font-bold text-text">Xin chào Quý khách</h1>

            <div className="relative mb-3">
              <select
                aria-label="Khách hàng"
                value={cif}
                onChange={(e) => {
                  setCif(e.target.value);
                  setError("");
                }}
                className="h-12 w-full appearance-none rounded-2xl border-none bg-surface-muted px-4 pr-10 text-sm text-text outline-none"
              >
                <option value="" disabled>
                  Chọn khách hàng
                </option>
                {customers.map((c) => (
                  <option key={c.cif} value={c.cif}>
                    {c.label} · {c.cif}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
            </div>

            <div className="relative mb-3">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="Nhập mật khẩu"
                className="h-12 w-full rounded-2xl border-none bg-surface-muted px-4 pr-12 text-sm text-text outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && <p className="mb-3 text-xs text-negative">{error}</p>}

            <button
              type="button"
              onClick={handleLogin}
              disabled={!cif}
              className="brand-gradient flex h-12 w-full items-center justify-center rounded-full text-base font-bold text-white transition-opacity disabled:opacity-40"
            >
              Đăng nhập
            </button>

            {/* Decorative — no help-center flow in this prototype. */}
            <p className="mt-3.5 text-center text-sm font-semibold text-primary">Hỗ trợ đăng nhập</p>

            <div className="my-4 border-t border-border" />

            {/* Decorative — no guest mode or self-registration flow in this prototype. */}
            <div className="flex items-center justify-around">
              <span className="flex items-center gap-2 text-sm font-semibold text-text">
                <Ticket size={17} /> Trải nghiệm trước
              </span>
              <span className="h-5 w-px bg-border" aria-hidden />
              <span className="flex items-center gap-2 text-sm font-semibold text-text">
                <CreditCard size={17} /> Đăng ký
              </span>
            </div>
          </div>

          <div className="shadow-card flex items-stretch justify-around rounded-[22px] bg-surface px-2 py-4">
            {QUICK_LINKS.map(({ label, icon: Icon }) => (
              <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Icon size={18} />
                </span>
                <span className="text-center text-[11px] font-medium text-text">{label}</span>
              </div>
            ))}
          </div>

          {/* Horizontally swipeable — same scroll-snap carousel as Home's promo row. */}
          <PromoCarousel
            items={[
              <PromoCard key="savings" variant="image" image="/brand/banner-savings.jpg" imageAlt="Ưu đãi tiết kiệm" />,
              <PromoCard key="business" variant="image" image="/brand/banner-business.jpg" imageAlt="Ưu đãi doanh nghiệp" />,
              <PromoCard key="family" variant="image" image="/brand/banner-family.jpg" imageAlt="Ưu đãi gia đình" />,
            ]}
          />
        </div>
      </div>
    </PhoneShell>
  );
}
