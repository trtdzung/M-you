"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { ErrorState, Loading } from "@/components/states";
import {
  AGENT_PREFERENCES_MAX,
  type AgentPreferences,
  type AgentTone,
  type ResponseLength,
  type RiskAppetite,
} from "@/domain/models";
import { cn } from "@/lib/cn";
import { useAgentPreferences } from "@/state/agent-preferences";

const RESPONSE_LENGTH_OPTIONS: { value: ResponseLength; label: string }[] = [
  { value: "concise", label: "Ngắn gọn" },
  { value: "balanced", label: "Vừa đủ" },
  { value: "detailed", label: "Chi tiết" },
];
const TONE_OPTIONS: { value: AgentTone; label: string }[] = [
  { value: "friendly", label: "Thân thiện" },
  { value: "formal", label: "Trang trọng" },
  { value: "playful", label: "Hài hước" },
];
const RISK_APPETITE_OPTIONS: { value: RiskAppetite; label: string }[] = [
  { value: "cautious", label: "Thận trọng" },
  { value: "balanced", label: "Cân bằng" },
  { value: "aggressive", label: "Rủi ro cao" },
];

/**
 * One accent per segmented group — three WARM tones from the jar palette
 * (`JAR_COLOR_OPTIONS`), staying inside the MSB brand's orange family rather
 * than reaching for the palette's cool colors (teal/plum), which read as
 * off-brand on an MSB screen. Purely decorative, no semantic meaning (never
 * reuse `--color-warning`/`--color-negative` here, which WOULD imply something).
 */
const GROUP_ACCENT = {
  responseLength: "#e8654e", // coral
  tone: "#a8562a", // sienna
  riskAppetite: "#d98324", // amber
} as const;

/**
 * A row of mutually-exclusive pill buttons; clicking the active one unselects
 * it back to "chưa chọn". `accent` — one hex color per group, from the SAME
 * palette jars already pick from (`JAR_COLOR_OPTIONS`) — marks the group with
 * a small dot next to its label and colors its selected pill, so the three
 * stacked groups read as distinct instead of one repeated grey block, even
 * before anything is picked (plan 261013 revision — "đỡ đơn điệu", replacing
 * an earlier logo row that only duplicated the chat header above the sheet).
 */
function SegmentedChoice<T extends string>({
  label,
  accent,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  accent: string;
  value: T | null;
  onChange: (next: T | null) => void;
  options: { value: T; label: string }[];
  disabled: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="flex items-center gap-1.5 text-sm font-medium text-text">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
        {label}
      </legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(active ? null : o.value)}
              style={active ? { background: accent } : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                active ? "text-white" : "bg-surface-muted text-text",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function TextField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  disabled,
  rows,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  maxLength: number;
  placeholder: string;
  disabled: boolean;
  /** Omitted = single-line `<input>`; a number renders a `<textarea>`. */
  rows?: number;
}) {
  const fieldClass =
    "min-h-11 rounded-row border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60";
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-sm font-medium text-text">
        {label}
        <span className="text-[11px] font-normal text-muted">{value.length}/{maxLength}</span>
      </span>
      {rows ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className={cn(fieldClass, "resize-none")}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          className={fieldClass}
        />
      )}
    </label>
  );
}

/**
 * "Hướng dẫn cho M-You" — the customer's standing instructions/preferences
 * (plan 261013), saved once per persona and applied to every future
 * conversation (`src/lib/agent-preference-seed.ts`), including ones that
 * started before this was ever saved. Opened from the gear icon in the chat
 * header, next to "Xóa hội thoại".
 *
 * Deliberately compact (plan 261013 revision — "không cần scroll"): short pill
 * labels, no per-field explainer paragraphs, and one small note at the very
 * bottom instead of a long description up top. "Về bạn" folds "sở thích" and
 * "thói quen tài chính" into ONE bigger box rather than two cramped one-liners.
 *
 * Every field is optional; "Lưu" saves the whole form in one write
 * (`useAgentPreferences().save`) and closes. A refused write (422 — an
 * over-length field slipping past the client cap, or a network error) keeps
 * the sheet open with the server's reason instead of silently discarding what
 * the customer typed.
 */
export function AgentPreferencesSheet({ onClose }: { onClose: () => void }) {
  const { preferences, status, save, reload } = useAgentPreferences();
  const [draft, setDraft] = useState<AgentPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The draft is seeded from the loaded preferences the FIRST time they become
  // available, then lives independently of `preferences` so the form doesn't
  // reset mid-edit if something else re-triggers a load.
  const form = draft ?? (status === "ready" ? preferences : null);

  function edit(patch: Partial<AgentPreferences>) {
    setError(null);
    setDraft({ ...(form ?? preferences), ...patch });
  }

  async function submit() {
    if (!form || saving) return;
    setSaving(true);
    setError(null);
    try {
      await save(form);
      onClose();
    } catch {
      setError("Không lưu được. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Hướng dẫn cho M-You" description="Giúp M-You hiểu bạn hơn." onClose={onClose}>
      {status === "loading" && <Loading label="Đang tải hướng dẫn…" />}
      {status === "error" && (
        <ErrorState
          description="Không tải được hướng dẫn hiện có."
          action={
            <button type="button" onClick={reload} className="text-sm font-semibold text-primary">
              Thử lại
            </button>
          }
        />
      )}
      {form && (
        <div className="flex flex-col gap-3">
          <SegmentedChoice
            label="Độ dài câu trả lời"
            accent={GROUP_ACCENT.responseLength}
            value={form.responseLength}
            onChange={(v) => edit({ responseLength: v })}
            options={RESPONSE_LENGTH_OPTIONS}
            disabled={saving}
          />
          <SegmentedChoice
            label="Giọng điệu"
            accent={GROUP_ACCENT.tone}
            value={form.tone}
            onChange={(v) => edit({ tone: v })}
            options={TONE_OPTIONS}
            disabled={saving}
          />
          <SegmentedChoice
            label="Khẩu vị rủi ro"
            accent={GROUP_ACCENT.riskAppetite}
            value={form.riskAppetite}
            onChange={(v) => edit({ riskAppetite: v })}
            options={RISK_APPETITE_OPTIONS}
            disabled={saving}
          />
          <TextField
            label="Cách xưng hô"
            value={form.addressAs}
            onChange={(v) => edit({ addressAs: v })}
            maxLength={AGENT_PREFERENCES_MAX.addressAs}
            placeholder="Ví dụ: chị Lan"
            disabled={saving}
          />
          <TextField
            label="Về bạn"
            value={form.about}
            onChange={(v) => edit({ about: v })}
            maxLength={AGENT_PREFERENCES_MAX.about}
            placeholder="Ví dụ: Tôi thích đầu tư cổ phiếu, tần suất theo dõi là 2 ngày 1 lần."
            disabled={saving}
            rows={4}
          />
          <TextField
            label="Hướng dẫn khác"
            value={form.notes}
            onChange={(v) => edit({ notes: v })}
            maxLength={AGENT_PREFERENCES_MAX.notes}
            placeholder="Bất cứ điều gì khác bạn muốn M-You biết"
            disabled={saving}
            rows={3}
          />

          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>

          <p className="text-[11px] text-muted">
            Cá nhân hoá cách M-You trò chuyện với bạn, áp dụng từ lần trò chuyện tiếp theo. Số liệu tài chính và các
            bước xác thực (OTP, xác nhận giao dịch…) luôn giữ nguyên.
          </p>
        </div>
      )}
    </Sheet>
  );
}
