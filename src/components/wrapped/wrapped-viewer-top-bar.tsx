import type { RefObject } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { CHROME } from "./wrapped-chrome-classes";
import { WrappedProgressBars } from "./WrappedProgressBars";
import type { WrappedThemeMode } from "./wrapped-slide-themes";
import { coverageChip, VIEWER } from "./wrapped-ui-copy";

const CONTROL =
  "pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2";

/**
 * Progress segments, the partial-coverage chip (only when some months have no data),
 * the eye (mask toggle) and the close button. The bar is click-through; only the
 * controls catch taps. Colours follow the current slide's theme `mode` (`CHROME`);
 * the decorative white MSB logo shows only on brand slides.
 */
export function WrappedViewerTopBar({
  mode,
  count,
  index,
  monthsWithData,
  monthsTotal,
  masked,
  onToggleMask,
  onClose,
  closeRef,
}: {
  mode: WrappedThemeMode;
  count: number;
  index: number;
  monthsWithData: number;
  monthsTotal: number;
  masked: boolean;
  onToggleMask: () => void;
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const chrome = CHROME[mode];
  const control = `${CONTROL} ${chrome.control}`;
  return (
    <div data-mode={mode} className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 px-4 pt-3">
      <WrappedProgressBars count={count} index={index} mode={mode} />
      <div className="flex items-center gap-2">
        {chrome.showLogo && (
          // eslint-disable-next-line @next/next/no-img-element -- static brand asset, same pattern as HomeHeader
          <img src="/brand/msb-logo-white.png" alt="" aria-hidden className="h-6 w-auto" />
        )}
        {monthsWithData < monthsTotal && (
          <span className={`rounded-pill px-3 py-1 text-xs font-semibold ${chrome.chip}`}>
            {coverageChip(monthsWithData, monthsTotal)}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          aria-label={VIEWER.hideAmounts}
          aria-pressed={masked}
          onClick={onToggleMask}
          className={control}
        >
          {masked ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
        </button>
        <button type="button" ref={closeRef} aria-label={VIEWER.close} onClick={onClose} className={control}>
          <X size={22} aria-hidden />
        </button>
      </div>
    </div>
  );
}
