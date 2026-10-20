"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/primitives";
import { AgentClarifyOptionsCard } from "@/components/pfm/AgentClarifyOptionsCard";
import { formatVnd } from "@/features/goals-preview/format-money";
import { fetchPriceEstimate, fetchPriceQuestions, type PriceAnswers, type PriceEstimate, type PriceQuestion } from "../../../client/price-estimate";
import { primaryButton, secondaryButton } from "../../shared/styles";

type Phase = "loading-form" | "form" | "researching" | "result" | "none" | "error";

/**
 * "Chưa rõ? Để M-You ước tính": agent trả form để khách tick, tra giá thị trường rồi đề xuất một mức giá.
 * Không phải chat (dùng lại thẻ hỏi bằng nút bấm của chat cho form): khách bấm OK để điền giá vào mục tiêu, hoặc Chạy lại để agent tra lại.
 */
export function PriceEstimateSheet({
  open,
  cif,
  template,
  description,
  onClose,
  onApply,
}: {
  open: boolean;
  cif: string | null;
  template: string;
  description: string;
  onClose: () => void;
  onApply: (amount: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading-form");
  const [questions, setQuestions] = useState<PriceQuestion[]>([]);
  const [answers, setAnswers] = useState<PriceAnswers>({});
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Mỗi lần mở: lấy form mới cho loại mục tiêu hiện tại.
  useEffect(() => {
    if (!open || !cif) return;
    const controller = new AbortController();
    abort.current = controller;
    setPhase("loading-form");
    setAnswers({});
    setEstimate(null);
    fetchPriceQuestions(cif, template, description, controller.signal)
      .then((found) => {
        setQuestions(found);
        setPhase("form");
      })
      .catch(() => {
        if (!controller.signal.aborted) setPhase("error");
      });
    return () => controller.abort();
    // `description` chỉ đọc lúc mở: gõ tên mục tiêu phía sau không làm form tải lại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cif, template]);

  const run = (refresh: boolean, given: PriceAnswers = answers) => {
    if (!cif) return;
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setPhase("researching");
    fetchPriceEstimate(cif, template, description, given, refresh, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;
        setEstimate(found);
        setPhase(found ? "result" : "none");
      })
      .catch(() => {
        if (!controller.signal.aborted) setPhase("error");
      });
  };

  const close = () => {
    abort.current?.abort();
    onClose();
  };

  return (
    <Sheet open={open} title="M-You ước tính giá" onClose={close}>
      <div className="flex flex-col gap-4">
        {phase === "loading-form" && <p role="status" className="animate-pulse text-sm text-muted">M-You đang chuẩn bị vài câu hỏi…</p>}

        {phase === "form" && (
          <>
            <p className="text-sm leading-6 text-text">Trả lời vài câu hỏi, M-You sẽ tra giá thị trường và đề xuất một mức giá cho mục tiêu.</p>
            {/* Cùng dạng "hỏi lại bằng nút bấm" của chat: mỗi lần một câu, có ô tự nhập; trả lời câu cuối là chạy luôn. */}
            <AgentClarifyOptionsCard
              ui={{ type: "clarify_options", questions: questions.map((q) => ({ question: q.title, options: q.options })) }}
              fullWidth
              onAnswer={() => {}}
              onAnswers={(list) => {
                const picked: PriceAnswers = Object.fromEntries(questions.map((q, i) => [q.id, [list[i].slice(0, 80)]]));
                setAnswers(picked);
                run(false, picked);
              }}
            />
          </>
        )}

        {phase === "researching" && <p role="status" className="animate-pulse text-sm leading-6 text-muted">M-You đang tìm giá thị trường, có thể mất khoảng nửa phút…</p>}

        {phase === "result" && estimate && (
          <>
            <div className="flex flex-col gap-1 rounded-2xl bg-surface-tint px-4 py-3">
              <span className="text-xs text-muted">M-You đề xuất</span>
              <span className="text-lg font-bold tabular-nums text-text">{formatVnd(estimate.amount)}</span>
              {estimate.low !== estimate.high && <span className="text-xs text-muted">Khoảng {formatVnd(estimate.low)} – {formatVnd(estimate.high)}</span>}
            </div>
            <p className="text-sm leading-6 text-text">{estimate.summary}</p>
            {estimate.sources.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs text-muted">
                {estimate.sources.map((source) => (
                  <li key={source.url} className="truncate">
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary-strong underline">{source.title}</a>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs leading-5 text-muted">Giá tham khảo tổng hợp từ web, chưa phải báo giá chính thức.</p>
            <div className="flex flex-col gap-2">
              <button type="button" className={primaryButton} onClick={() => { onApply(estimate.amount); close(); }}>OK</button>
              <button type="button" className={secondaryButton} onClick={() => run(true)}>Chạy lại</button>
              <button type="button" className="text-xs font-semibold text-primary-strong" onClick={() => setPhase("form")}>Sửa lựa chọn</button>
            </div>
          </>
        )}

        {(phase === "none" || phase === "error") && (
          <>
            <p role="alert" className="rounded-2xl bg-warning-soft px-3.5 py-3 text-sm leading-6 text-text">
              {phase === "none" ? "M-You chưa tìm đủ giá để đề xuất cho lựa chọn này. Bạn thử đổi lựa chọn hoặc chạy lại nhé." : "Chưa ước tính được lúc này. Bạn thử lại sau nhé."}
            </p>
            <div className="flex flex-col gap-2">
              {phase === "none" && <button type="button" className={primaryButton} onClick={() => run(true)}>Chạy lại</button>}
              {phase === "none" && <button type="button" className={secondaryButton} onClick={() => setPhase("form")}>Sửa lựa chọn</button>}
              <button type="button" className={secondaryButton} onClick={close}>Đóng</button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
