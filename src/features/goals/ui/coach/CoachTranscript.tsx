import type { CoachTurn } from "../../client/hooks/use-goal-coach";

/** Questions asked and answers given so far. */
export function CoachTranscript({ turns }: { turns: CoachTurn[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {turns.map((t, i) => (
        <li
          key={i}
          className={
            t.role === "customer"
              ? "ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-surface-muted px-4 py-3 text-[16px] leading-6 text-text"
              : "max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-surface-tint px-4 py-3 text-[16px] leading-6 text-text"
          }
        >
          {t.text}
        </li>
      ))}
    </ul>
  );
}
