"use client";

import { useState } from "react";
import { transferNow } from "@/lib/demo-clock";
import { useGoalCoach } from "../../client/hooks/use-goal-coach";
import { draftToForm } from "../../coach/to-form";
import { CoachFallback } from "../coach/CoachFallback";
import { CoachInput } from "../coach/CoachInput";
import { CoachOutOfScope } from "../coach/CoachOutOfScope";
import { CoachQuestion } from "../coach/CoachQuestion";
import { CoachTranscript } from "../coach/CoachTranscript";
import { GOALS_COPY } from "../copy";
import { secondaryButton } from "../styles";
import { CreateGoalFlow } from "./CreateGoalFlow";

/** Goal Coach on /goals: say a goal, answer a few chips, review the pre-filled form. */
export function GoalCoachPanel({ onCreated }: { onCreated: () => void }) {
  const coach = useGoalCoach();
  const [manual, setManual] = useState(false);
  const busy = coach.phase === "asking" || coach.phase === "answering";
  const restart = () => {
    setManual(false);
    coach.reset();
  };

  let body;
  if (coach.phase === "idle") body = <CoachInput onSubmit={coach.start} />;
  else if (coach.phase === "out_of_scope") body = <CoachOutOfScope onRestart={restart} />;
  else if (coach.phase === "failed") {
    body = <CoachFallback request={coach.request} onManual={() => setManual(true)} onRestart={restart} />;
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <CoachTranscript turns={coach.turns} />
        {busy && <p className="text-sm text-muted">{GOALS_COPY.coach.thinking}</p>}
        {coach.question && (
          <CoachQuestion
            key={coach.question.code + coach.answers.length}
            question={coach.question}
            onAnswer={(value, source) => coach.answer(coach.question!.slot, value, source)}
          />
        )}
        {coach.draft && <p className="text-sm text-text">{GOALS_COPY.coach.draftReady}</p>}
        <button type="button" onClick={restart} className={secondaryButton}>
          {GOALS_COPY.coach.restart}
        </button>
      </div>
    );
  }

  const done = () => {
    onCreated();
    restart();
  };
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-[18px] leading-6 font-semibold text-text">M-You</h2>
      {coach.phase === "idle" && <div className="rounded-2xl rounded-tl-sm bg-surface-tint p-4">
        <p className="text-[16px] leading-6 font-medium text-text">Bạn đang muốn dành tiền cho điều gì?</p>
        <p className="mt-2 text-[14px] leading-6 text-muted">Kể mình nghe, mình sẽ giúp bạn xác định số tiền và thời gian.</p>
      </div>}
      {body}
      {coach.draft && (
        <CreateGoalFlow
          prefill={draftToForm(coach.draft, transferNow())}
          requestKey={coach.requestId ? `coach:${coach.requestId}` : undefined}
          onCreated={done}
          onClose={restart}
        />
      )}
      {manual && (
        <CreateGoalFlow suggestion={coach.request} onCreated={done} onClose={() => setManual(false)} />
      )}
    </section>
  );
}
