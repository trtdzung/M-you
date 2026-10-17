"use client";

import { SegmentedControl } from "@/components/primitives";
import type { GoalFlexibility } from "../../../model/types";
import { GOALS_COPY } from "../../copy";
import { label } from "../../styles";

const OPTIONS = [
  { value: "flexible", label: GOALS_COPY.flexibility.flexible },
  { value: "fixed", label: GOALS_COPY.flexibility.fixed },
] as const;

export function FlexibilityField({
  value,
  onChange,
}: {
  value: GoalFlexibility;
  onChange: (v: GoalFlexibility) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className={label}>{GOALS_COPY.form.flexibility}</span>
      <SegmentedControl
        options={OPTIONS}
        value={value}
        onChange={onChange}
        ariaLabel={GOALS_COPY.form.flexibility}
      />
    </div>
  );
}
