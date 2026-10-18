import type { SecurityLevel } from "./security-score";

/** Half-circle gauge filled to `score`/100. */
export function SecurityGauge({ score, level }: { score: number; level: SecurityLevel }) {
  const strong = level !== "Tiêu chuẩn";
  return <div className="relative mx-auto h-40 max-w-72">
    <svg viewBox="0 0 300 160" className="h-full w-full" aria-hidden="true">
      <path d="M 35 135 A 115 115 0 0 1 265 135" fill="none" stroke="#dfe6ef" strokeWidth="22" strokeLinecap="round" />
      <path d="M 35 135 A 115 115 0 0 1 265 135" fill="none" stroke={strong ? "#20b779" : "currentColor"} className={strong ? undefined : "text-primary"} strokeWidth="22" strokeLinecap="round" pathLength="100" strokeDasharray={`${score} 100`} />
    </svg>
    <div className="absolute inset-x-0 bottom-2 text-center">
      <p><span className={`text-4xl font-bold ${strong ? "text-emerald-600" : "text-primary"}`}>{score}</span><span className="text-sm text-muted">/100</span></p>
      <p className="mt-1 text-sm font-semibold">Cấp độ: {level}</p>
    </div>
  </div>;
}
