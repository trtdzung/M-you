"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { cn } from "@/lib/cn";
import type { RiskProfile } from "../../model/types";
import { primaryButton, ring, secondaryButton } from "./styles";

const QUESTIONS: { title: string; options: [string, string, string] }[] = [
  { title: "Bao lâu nữa bạn cần dùng số tiền này?", options: ["Dưới 1 năm", "1–3 năm", "Trên 3 năm"] },
  { title: "Nếu giá trị khoản đầu tư giảm 10% trong một tháng, bạn sẽ…", options: ["Rút ngay", "Chờ xem", "Đầu tư thêm"] },
  {
    title: "Điều bạn ưu tiên nhất là…",
    options: ["Giữ an toàn số tiền gốc", "Cân bằng an toàn và sinh lời", "Sinh lời cao, chấp nhận biến động"],
  },
];

/** Tổng điểm 0–2 → thận trọng, 3–4 → cân bằng, 5–6 → tăng trưởng. */
export function riskProfileFromScore(total: number): RiskProfile {
  return total <= 2 ? "conservative" : total <= 4 ? "balanced" : "growth";
}

/** Bộ 3 câu hỏi khẩu vị rủi ro; "Lưu" trả về khẩu vị, "Để sau" chỉ đóng (lần sau hỏi lại). */
export function RiskProfileSheet({
  open,
  onSave,
  onClose,
}: {
  open: boolean;
  onSave: (profile: RiskProfile) => void;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>([null, null, null]);
  const complete = answers.every((a) => a !== null);

  return (
    <Sheet open={open} title="Bạn chấp nhận rủi ro đến đâu?" description="Trả lời 3 câu ngắn để MSB gợi ý sản phẩm phù hợp với bạn." onClose={onClose}>
      <div className="flex flex-col gap-4">
        {QUESTIONS.map((q, qi) => (
          <div key={q.title} role="radiogroup" aria-label={q.title} className="flex flex-col gap-2">
            <p className="text-[15px] font-semibold text-text">{q.title}</p>
            {q.options.map((label, oi) => {
              const active = answers[qi] === oi;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)))}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-card border-2 bg-surface px-4 py-2 text-left text-sm text-text transition-colors",
                    ring,
                    active ? "border-primary" : "border-border",
                  )}
                >
                  <span aria-hidden className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-primary" : "border-border")}>
                    {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className={primaryButton}
            disabled={!complete}
            onClick={() => {
              onSave(riskProfileFromScore(answers.reduce<number>((sum, a) => sum + (a ?? 0), 0)));
              onClose();
            }}
          >
            Lưu
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Để sau
          </button>
        </div>
      </div>
    </Sheet>
  );
}
