/**
 * Nhãn "DEMO" cố định, kín đáo — tách rõ prototype khỏi app MSB thật (chống dùng
 * nhầm chrome clone làm phishing template — Red Team #15). Luôn hiện, không phá
 * layout: ghim góc phải khung điện thoại, trên bottom nav. Presentation-only.
 */
export function DemoBadge() {
  return (
    <span
      className="pointer-events-none absolute left-3 top-[calc(var(--safe-area-top)+2.75rem)] z-30 select-none rounded-full bg-neutral-900/65 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white shadow-sm backdrop-blur-sm"
      aria-label="Bản demo — nguyên mẫu, không phải ứng dụng MSB thật"
    >
      Demo
    </span>
  );
}
