"use client";

import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { joinClarifyAnswers, type ClarifyOptionsUi } from "@/lib/agent-api";

/**
 * One question inside the card: option buttons, PLUS an always-visible free-text
 * box right under them (no "Khác" toggle to click first — the box is there from
 * the start). With a single question in the turn, picking a button OR confirming
 * the text box fires immediately (`onPick`, no `selected` tracking needed — the
 * parent just sends). With several questions, this becomes a TOGGLE (`selected`
 * shows which answer is currently held for this question, `onPick` replaces it)
 * and nothing is sent until every question in the card has an answer and the
 * customer presses the shared "Gửi" button — the contract requires every pick
 * combined into one message (`joinClarifyAnswers`), never one message per question.
 */
function QuestionBlock({
  question,
  options,
  disabled,
  selected,
  onPick,
}: {
  question: string;
  options: string[];
  disabled?: boolean;
  /** Only used in multi-question mode — the answer currently held for this question, if any. */
  selected?: string | null;
  onPick: (text: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const multi = selected !== undefined;

  function submitCustom() {
    const text = custom.trim();
    if (!text) return;
    onPick(text);
    if (!multi) setCustom(""); // single-question mode sends immediately and clears; multi keeps it visible as the held answer
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-text">{question}</p>
      <div className="flex flex-col gap-1.5">
        {options.map((opt) => {
          const isSelected = multi && selected === opt;
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => onPick(opt)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-60",
                isSelected
                  ? "border-primary bg-primary-soft text-text"
                  : "border-border bg-surface text-text hover:border-primary hover:bg-primary-soft",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitCustom();
          }}
          disabled={disabled}
          placeholder="Hoặc tự nhập câu trả lời khác…"
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60"
        />
        <button
          type="button"
          disabled={disabled || !custom.trim()}
          onClick={submitCustom}
          aria-label="Dùng câu trả lời tự nhập"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
        >
          <Check size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * The interactive "hỏi lại bằng nút bấm" card (`clarify_options`,
 * `agent_backend_docs/clarify-options.md`) — modeled on how Claude's own
 * `AskUserQuestion` asks the customer here: 1–4 independent questions, each a
 * pick list PLUS an always-visible free-text box, never a hard-forced choice
 * (the chat channel stays open regardless — doc point 4). With several
 * questions, they show ONE AT A TIME (a small "Câu X/N" step, not the whole
 * list stacked at once) — answering the last one submits right away. This
 * component only turns the customer's picks into the ONE `/chat` message the
 * contract wants (`onAnswer`) — it never talks to the network itself. Which
 * card is active, reopened for editing, or already answered lives in the
 * caller (`MYourWidget` / `VoiceFab`); `answer`, the lead-in sentence, is the
 * caller's own message bubble text, rendered separately from this card (doc:
 * both are shown).
 */
export function AgentClarifyOptionsCard({
  ui,
  disabled,
  reopened,
  hasPrevious,
  onAnswer,
  onBack,
  onCancelEdit,
  fullWidth = false,
}: {
  ui: ClarifyOptionsUi;
  /** True while a message is in flight — every control disables. */
  disabled?: boolean;
  /** True when this card is a PAST turn the customer reopened to change (not the live latest one). */
  reopened?: boolean;
  /** True when an earlier `clarify_options` TURN precedes this one in an unbroken chain — shows "← Câu trước". */
  hasPrevious?: boolean;
  onAnswer: (text: string) => void;
  onBack?: () => void;
  /** Only meaningful when `reopened` — return to the live latest turn without sending anything. */
  onCancelEdit?: () => void;
  fullWidth?: boolean;
}) {
  const single = ui.questions.length === 1;
  // Multi-question mode walks the questions ONE AT A TIME (`step`) rather than
  // listing them all — `picks` still holds every answer collected so far (kept
  // across steps, so stepping back and forth never loses one), just only the
  // CURRENT step's question renders. Answering the last step submits right away;
  // single-question mode still sends the instant a button (or custom text) fires
  // (no stepping — there is only ever one question to show).
  const [picks, setPicks] = useState<(string | null)[]>(() => ui.questions.map(() => null));
  const [step, setStep] = useState(0);

  function pick(i: number, text: string) {
    if (single) {
      onAnswer(text);
      return;
    }
    const next = picks.map((p, idx) => (idx === i ? text : p));
    setPicks(next);
    if (i === ui.questions.length - 1) {
      onAnswer(joinClarifyAnswers(next as string[])); // last question just answered — every pick is filled
    } else {
      setStep(i + 1);
    }
  }

  // "← Câu trước" is ONE control for two things, whichever applies: inside a
  // multi-question turn it steps back to the PREVIOUS question of this same
  // turn (no network call); at its first question (or a single-question turn)
  // it instead reopens the previous `clarify_options` TURN, if the chain has one.
  const canStepBack = !single && step > 0;
  const showBack = canStepBack || hasPrevious;
  function handleBack() {
    if (canStepBack) setStep((s) => s - 1);
    else onBack?.();
  }

  const question = ui.questions[single ? 0 : step];

  return (
    <div className={cn("shadow-card mt-2 flex flex-col gap-3 rounded-2xl bg-surface p-3", fullWidth ? "w-full" : "max-w-[85%]")}>
      {reopened && (
        <p className="rounded-lg bg-surface-tint px-2.5 py-1.5 text-[11px] text-muted">
          Bạn đang sửa lại câu trả lời này — câu trả lời mới sẽ được gửi tiếp vào đoạn chat, các tin nhắn cũ vẫn giữ nguyên.
        </p>
      )}

      {!single && (
        <p className="text-[11px] font-semibold text-muted">
          Câu {step + 1}/{ui.questions.length}
        </p>
      )}

      <QuestionBlock
        key={step}
        question={question.question}
        options={question.options}
        disabled={disabled}
        selected={single ? undefined : picks[step]}
        onPick={(text) => pick(step, text)}
      />

      {(showBack || reopened) && (
        <div className="flex items-center gap-3 border-t border-border pt-2">
          {showBack && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleBack}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-text disabled:opacity-60"
            >
              <ArrowLeft size={13} aria-hidden /> Câu trước
            </button>
          )}
          {reopened && (
            <button
              type="button"
              disabled={disabled}
              onClick={onCancelEdit}
              className="text-xs font-semibold text-muted hover:text-text disabled:opacity-60"
            >
              Quay lại câu hỏi hiện tại
            </button>
          )}
        </div>
      )}
    </div>
  );
}
