import { useId } from "react";
import type { SecurityLevel } from "@/lib/security/security-score";

/** Half-circle gauge filled to `score`/100. */
export function SecurityGauge({ score, level }: { score: number; level: SecurityLevel }) {
  const gradientId = useId();
  const value = Math.min(100, Math.max(0, score));
  return <div className="security-gauge" role="meter" aria-label="Điểm bảo mật" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={`${value}/100 · ${level}`}>
    <svg viewBox="0 0 320 190" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="58" y1="166" x2="262" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8bc899" />
          <stop offset="1" stopColor="#609965" />
        </linearGradient>
      </defs>
      <path d="M 58 166 A 102 102 0 0 1 262 166" fill="none" stroke="#e1e4ec" strokeWidth="22" strokeLinecap="round" />
      {value > 0 && <path d="M 58 166 A 102 102 0 0 1 262 166" fill="none" stroke={`url(#${gradientId})`} strokeWidth="22" strokeLinecap="round" pathLength="100" strokeDasharray={`${value} 100`} />}
      <g stroke="#609965" strokeWidth="3" strokeLinecap="round">
        <path d="M 29 178 H 42" />
        <path d="M 160 29 V 42" />
        <path d="M 266 115 L 277 109" />
        <path d="M 279 178 H 292" />
      </g>
      <g fill="#73777f" fontSize="13" textAnchor="middle">
        <text x="59" y="76" transform="rotate(-55 59 76)">Tiêu chuẩn</text>
        <text x="232" y="49" transform="rotate(35 232 49)">Cao</text>
        <text x="291" y="139" transform="rotate(75 291 139)">Rất cao</text>
      </g>
      <text x="160" y="119" textAnchor="middle" fill="#73777f" fontSize="15" fontWeight="500">Điểm bảo mật</text>
      <text x="160" y="151" textAnchor="middle">
        <tspan fill="#609965" fontSize="30" fontWeight="700">{value}</tspan>
        <tspan fill="#73777f" fontSize="16">/100</tspan>
      </text>
    </svg>
  </div>;
}
