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
              ? "ml-auto max-w-[85%] rounded-2xl bg-surface-muted px-3 py-2 text-sm text-text"
              : "max-w-[85%] text-sm text-muted"
          }
        >
          {t.text}
        </li>
      ))}
    </ul>
  );
}
