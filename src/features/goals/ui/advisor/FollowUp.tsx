"use client";

import { useState } from "react";
import { followUpChips } from "../../advisor/templates";
import type { AnalyzeDraft } from "../../advisor/analysis-types";
import { GOALS_COPY } from "../copy";
import { chip, hint, input, primaryButton } from "../styles";

/** Edit the plan by words: quick chips or a free sentence ("lùi 6 tháng", "giảm 100 triệu"). */
export function FollowUp({
  draft,
  status,
  onSubmit,
}: {
  draft: AnalyzeDraft;
  status: "idle" | "busy" | "unclear" | "failed";
  onSubmit: (text: string) => void;
}) {
  const c = GOALS_COPY.advisor.followUp;
  const [text, setText] = useState("");
  const busy = status === "busy";
  const send = (value: string) => {
    if (!value.trim() || busy) return;
    onSubmit(value);
    setText("");
  };
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <h4 className="text-[13px] font-semibold text-text">{c.title}</h4>
      <div className="flex flex-wrap gap-2">
        {followUpChips(draft).map((label) => (
          <button key={label} type="button" disabled={busy} className={chip} onClick={() => send(label)}>{label}</button>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input aria-label={c.title} className={`${input} min-w-0 flex-1`} value={text} maxLength={200} placeholder={c.placeholder} disabled={busy} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={busy || !text.trim()} className={`${primaryButton} shrink-0`}>{c.send}</button>
      </form>
      {status !== "idle" && <p role="status" className={hint}>{status === "busy" ? c.busy : status === "unclear" ? c.unclear : c.failed}</p>}
    </section>
  );
}
