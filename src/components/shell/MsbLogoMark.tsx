import { cn } from "@/lib/cn";

/**
 * Dấu hiệu thương hiệu MSB — ribbon "M" cam-đỏ (gradient brand). Dùng ở HomeHeader
 * và có thể tái dùng. Presentation-only; `aria-hidden` (chữ "MSB" đi kèm mang nghĩa).
 */
export function MsbLogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      className={cn("h-auto", className)}
      role="presentation"
      aria-hidden="true"
      fill="none"
    >
      <defs>
        <linearGradient id="msb-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8321e" />
          <stop offset="1" stopColor="#f5822c" />
        </linearGradient>
      </defs>
      <circle cx="22" cy="62" r="16" fill="url(#msb-mark)" />
      <g fill="url(#msb-mark)">
        <rect x="20" y="8" width="18" height="74" rx="9" transform="rotate(-14 29 45)" />
        <rect x="51" y="8" width="18" height="74" rx="9" transform="rotate(14 60 45)" />
        <rect x="82" y="8" width="18" height="74" rx="9" transform="rotate(-14 91 45)" />
      </g>
    </svg>
  );
}
