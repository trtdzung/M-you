import { GOALS_COPY } from "../copy";
import { MoneyField } from "../form/fields/MoneyField";

/** Not enough transactions to estimate a surplus: invite the user to type one. */
export function FeasibilityUnknown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <MoneyField
      label={GOALS_COPY.form.surplus}
      hint={GOALS_COPY.form.surplusHint}
      value={value}
      onChange={onChange}
    />
  );
}
