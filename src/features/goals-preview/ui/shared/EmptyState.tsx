import type { ReactNode } from "react";
import { Target } from "lucide-react";
import { Empty } from "@/components/states";
import { primaryButton } from "./styles";

/** Empty state with one CTA (wraps the app's `Empty`). */
export function EmptyState({
  title,
  description,
  ctaLabel,
  onCta,
  icon,
}: {
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
  icon?: ReactNode;
}) {
  return (
    <Empty
      title={title}
      description={description}
      icon={icon ?? <Target size={40} strokeWidth={1.5} />}
      action={
        ctaLabel && onCta ? (
          <button type="button" className={`${primaryButton} mt-2 max-w-[260px]`} onClick={onCta}>
            {ctaLabel}
          </button>
        ) : undefined
      }
    />
  );
}
