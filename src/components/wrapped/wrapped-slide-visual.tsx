import type { ReactElement } from "react";
import type { WrappedSlide } from "@/domain/wrapped";
import { ClosingRecapBento } from "./closing-recap-bento";
import { hasPillarScore, HealthPillarsVisual, healthPillarRows } from "./health-pillars-visual";
import { JarFillVisual } from "./jar-fill-visual";
import { RecurringReceiptVisual } from "./recurring-receipt-visual";
import { TopMerchantsVisual } from "./top-merchants-visual";
import { hasSpendShape, TotalSpendVisual } from "./total-spend-visual";
import { WeekdayHabitsVisual } from "./weekday-habits-visual";
import type { WrappedDeckCtx } from "./wrapped-deck-context";
import { WrappedPeriodStripVisual } from "./wrapped-period-strip-visual";
import { merchantRows, recurringRows, top3ShareText } from "./wrapped-visual-data-lists";
import { fixedShareText, jarRows, weekdayColumns, windowMonthKeys } from "./wrapped-visual-data-spend";

interface SlideVisualProps {
  slide: WrappedSlide;
  masked: boolean;
  deckCtx: WrappedDeckCtx;
}

/**
 * The per-slide visual element (`aria-hidden`, shape only), or `null` when that visual
 * would draw nothing — the same empty rules each visual applies itself — so the frame
 * never wraps an empty surface card. Visuals colour peaks/fills from the frame's
 * `--wr-accent` var (single accent source: `SLIDE_THEMES[id].accent` via `themeVars`).
 * Slides without a visual are typographic.
 */
export function slideVisualFor({ slide, masked, deckCtx }: SlideVisualProps): ReactElement | null {
  switch (slide.id) {
    case "opening":
      // Without the deck's month info nothing is known: draw nothing rather than guess.
      if (!deckCtx.monthKeys || !deckCtx.monthKnown || deckCtx.monthKeys.length === 0) return null;
      return <WrappedPeriodStripVisual monthKeys={deckCtx.monthKeys} monthKnown={deckCtx.monthKnown} />;
    case "total-spend": {
      const series = slide.series ?? [];
      if (!hasSpendShape(series, masked)) return null;
      const monthKeys = windowMonthKeys(deckCtx.periodFrom, series.length);
      return <TotalSpendVisual series={series} monthKeys={monthKeys} masked={masked} />;
    }
    case "jar-share": {
      const rows = jarRows(slide, masked);
      return rows.length === 0 ? null : <JarFillVisual rows={rows} fixedShare={fixedShareText(slide)} />;
    }
    case "habits": {
      const columns = weekdayColumns(slide, masked);
      return columns.length === 0 ? null : <WeekdayHabitsVisual columns={columns} />;
    }
    case "top-merchants": {
      const rows = merchantRows(slide, masked);
      if (rows.length === 0) return null;
      return <TopMerchantsVisual rows={rows} top3Share={top3ShareText(slide)} />;
    }
    case "recurring": {
      const rows = recurringRows(slide, masked);
      return rows.length === 0 ? null : <RecurringReceiptVisual rows={rows} />;
    }
    case "archetype":
      // The flip card is interactive, so the frame renders it outside the aria-hidden block.
      return null;
    case "health": {
      const rows = healthPillarRows(slide);
      return hasPillarScore(rows) ? <HealthPillarsVisual rows={rows} /> : null;
    }
    case "closing": {
      const tiles = deckCtx.recap ?? [];
      return tiles.length === 0 ? null : <ClosingRecapBento tiles={tiles} />;
    }
  }
}
