import { cn } from "@/lib/cn";

/**
 * Glass "M" ribbon watermark nổi giữa hero Home (khớp ref `1.1`). Translucent
 * trắng + highlight mềm gợi cảm giác kính mờ. Presentation-only, `aria-hidden`.
 * Dùng lại được ở empty-state hero nếu cần.
 */
export function BrandWatermark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 150"
      className={cn("h-auto", className ?? "w-full")}
      role="presentation"
      aria-hidden="true"
      fill="none"
    >
      <defs>
        <linearGradient id="bw-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.14" />
        </linearGradient>
      </defs>
      {/* Circle (đầu ribbon dưới-trái) */}
      <circle
        cx="46"
        cy="104"
        r="30"
        fill="url(#bw-glass)"
        stroke="#ffffff"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      {/* Ba nét chéo bo tròn tạo hình M */}
      <g stroke="#ffffff" strokeOpacity="0.4" strokeWidth="1.5">
        <rect
          x="46"
          y="16"
          width="34"
          height="120"
          rx="17"
          transform="rotate(-16 63 76)"
          fill="url(#bw-glass)"
        />
        <rect
          x="96"
          y="16"
          width="34"
          height="120"
          rx="17"
          transform="rotate(16 113 76)"
          fill="url(#bw-glass)"
        />
        <rect
          x="146"
          y="16"
          width="34"
          height="120"
          rx="17"
          transform="rotate(-16 163 76)"
          fill="url(#bw-glass)"
        />
      </g>
    </svg>
  );
}
