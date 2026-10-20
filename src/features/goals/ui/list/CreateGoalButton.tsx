import { GOALS_COPY } from "../copy";
import { primaryButton } from "../styles";

export function CreateGoalButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${primaryButton} w-full leading-5`}>
      {GOALS_COPY.create}
    </button>
  );
}
