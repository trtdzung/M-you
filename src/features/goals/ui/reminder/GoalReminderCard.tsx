import type { Lever } from "../../model/types";
import type { GoalReminder } from "../../model/reminder-types";
import { GOALS_COPY } from "../copy";
import { formatGoalMoney } from "../shared/format-goal-money";
import { chip, primaryButton, secondaryButton } from "../styles";

function leverText(l: Lever): string {
  const c = GOALS_COPY.feasibility;
  if (l.kind === "extend_date") return c.extendDate(l.newDate.split("-").reverse().join("/"));
  if (l.kind === "reduce_amount") return c.reduceAmount(formatGoalMoney(l.newTarget));
  return c.cutCategory(l.categoryLabel, formatGoalMoney(l.cutPerMonth));
}

/**
 * One proactive note on a goal; never blames. To mount it: render `<GoalReminderCard>` in the goal detail
 * screen with `useGoalReminder(goal.id)` and wire the callbacks (pause/archive via `update`, edit via the
 * existing edit flow, contribute via the ledger flow).
 */
export function GoalReminderCard({
  reminder,
  onDismiss,
  onPause,
  onEdit,
  onArchive,
  onContribute,
}: {
  reminder: GoalReminder;
  onDismiss: () => void;
  onPause?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  onContribute?: () => void;
}) {
  const c = GOALS_COPY.reminder;
  let text: string;
  let actions: [string, (() => void) | undefined, boolean][] = [[c.ok, onDismiss, false]];
  switch (reminder.kind) {
    case "milestone":
      text = c.milestone(reminder.milestone ?? 0);
      break;
    case "nudge":
      text = c.nudge(formatGoalMoney(reminder.amount ?? 0));
      actions = [[c.contribute, onContribute, true], [c.dismiss, onDismiss, false]];
      break;
    case "levers":
      text = c.levers;
      actions = [[c.editAction, onEdit, true], [c.dismiss, onDismiss, false]];
      break;
    case "pause_month":
      text = c.pause;
      actions = [[c.pauseAction, onPause, true], [c.dismiss, onDismiss, false]];
      break;
    case "missed_repeatedly":
      text = c.missed;
      actions = [[c.keepAction, onDismiss, false], [c.editAction, onEdit, true], [c.archiveAction, onArchive, false]];
      break;
  }
  return (
    <section role="status" aria-label="Lời nhắc" className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-surface-tint p-4">
      <p className="text-[14px] leading-6 text-text">{text}</p>
      {reminder.kind === "levers" && (
        <ul className="list-disc pl-5 text-[13px] leading-5 text-muted">
          {reminder.levers.slice(0, 3).map((l) => <li key={l.kind}>{leverText(l)}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {actions.filter(([, fn]) => fn).map(([label, fn, primary]) => (
          <button key={label} type="button" onClick={fn} className={primary ? `${primaryButton} px-5` : reminder.kind === "missed_repeatedly" ? secondaryButton : chip}>{label}</button>
        ))}
      </div>
    </section>
  );
}
