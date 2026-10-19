"use client";

import type { ReactNode } from "react";
import { AI_SESSION_LINE } from "@/lib/security/scenario-copy";
import type { Intervention } from "@/lib/security/intervention-types";

/** Spec bold phrases (`emphasis`) rendered as <strong> inside the message. */
export function Emphasized({ text, emphasis }: { text: string; emphasis: string[] }) {
  if (!emphasis.length) return <>{text}</>;
  const pattern = new RegExp(`(${emphasis.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return <>{text.split(pattern).map((part, i) => emphasis.includes(part) ? <strong key={i}>{part}</strong> : part)}</>;
}

/** UC13: the customer is talking to an AI, shown on scan, case review, and agent popups. */
export function AiSessionNote() {
  return <p className="text-[15px] leading-relaxed text-muted">{AI_SESSION_LINE}</p>;
}

/** Who wrote the words: the rule engine (spec wording) or the M-You agent. */
export function SourceLine({ intervention }: { intervention: Pick<Intervention, "source"> }) {
  return (
    <p className="shield-source">
      {intervention.source === "agent" ? "M-You, trợ lý AI của MSB" : "Cảnh báo tự động"}
    </p>
  );
}

const chipClass = "shield-action";

/** Chip label on the hub score warning → the task name shown on its card. */
const STEP_BY_CTA: Record<string, string> = {
  "Bật mã": "Mã chống giả mạo",
  "Thêm người thân": "Người thân khẩn cấp",
  "Đổi mật khẩu": "Đổi mật khẩu",
  "Bật bảo vệ": "M-You bảo vệ bạn",
  "Thiết lập": "Xác thực nâng cao",
  "Thêm danh bạ": "Danh bạ tin cậy",
};

/** The two hub suggestions, in chip order, with the points written in the sentence. */
function progressCards(message: string, chips: string[]): { label: string; points: number | null; cta: string }[] | null {
  if (chips.length < 2 || !chips.every(chip => STEP_BY_CTA[chip])) return null;
  const points = [...message.matchAll(/\(\+(\d+)\)/g)].map(match => Number(match[1]));
  return chips.slice(0, 2).map((cta, index) => ({ label: STEP_BY_CTA[cta], points: points[index] ?? null, cta }));
}

/** Message, question and chips of one intervention. */
export function InterventionBody({ intervention, onChoose, extra }: {
  intervention: Intervention;
  onChoose: (choice: string) => void;
  extra?: ReactNode;
}) {
  const { copy } = intervention;
  const message = intervention.scenario === "BT6"
    ? "Thêm người nhận này vào danh bạ tin cậy sau khi bạn đã xác minh. Danh bạ được dùng để điều chỉnh cảnh báo và giữ giao dịch theo cài đặt."
    : copy.message;
  const cards = (intervention.scenario === "BT2" || intervention.scenario === "HUB") ? progressCards(message, copy.chips) : null;
  return (
    <div className="shield-notice-body">
      {cards ? (
        <>
          <p className="shield-source">Tiến độ bảo mật</p>
          <div className="shield-progress">
            {cards.map(card => (
              <article key={card.cta} className="shield-progress-card">
                <strong>{card.label}</strong>
                {card.points != null && <p>+{card.points} điểm</p>}
                <button type="button" aria-label={`${card.label}: Thực hiện`} onClick={() => onChoose(card.cta)}>Thực hiện</button>
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          <SourceLine intervention={intervention} />
          {message && <p className="whitespace-pre-line text-[15px] leading-relaxed"><Emphasized text={message} emphasis={copy.emphasis} /></p>}
          {copy.question && <p className="text-[15px] font-semibold leading-relaxed">{copy.question}</p>}
          {copy.chips.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {copy.chips.map(chip => <button key={chip} type="button" className={chipClass} onClick={() => onChoose(chip)}>{chip}</button>)}
            </div>
          )}
        </>
      )}
      {extra}
    </div>
  );
}
