/** Public surface of the Wrapped domain module. UI imports only from here. */

export { buildWrapped } from "./build-wrapped";
export { wrappedCoverage } from "./wrapped-coverage";
export { wrappedEndMonthKey, wrappedMonthKeys, wrappedPeriod } from "./wrapped-period";
export { sanitizeLabel } from "./sanitize-label";
export { findFact } from "./wrapped-fact";
export { archetypeSlide, assignArchetype, ARCHETYPE_FACT_ID } from "./archetype";
export type { ArchetypeResult } from "./archetype";
export { copyForSlide, WRAPPED_DISCLOSURE } from "./wrapped-copy-vi";
export type { WrappedSlideCopy } from "./wrapped-copy-vi";
export type { WrappedCopyLine, WrappedHero, WrappedLineKind } from "./wrapped-copy-helpers";
export { ARCHETYPE_COPY, CLOSING_CTA } from "./wrapped-copy-vi-story";
export { formatHealthScore, HEALTH_PILLAR_COPY, HEALTH_TIER_COPY } from "./wrapped-copy-vi-health";
export { HEALTH_PILLARS, HEALTH_SCORE_ASSUMPTION, healthSlide } from "./facts-health";
export {
  formatWrappedMoney,
  MASKED_HERO_VALUE,
  MASKED_MONEY,
  UNKNOWN_TEXT,
  wrappedHeroMoney,
} from "./wrapped-money-format";
export { formatWrappedCount, formatWrappedPct, heroDigits, monthKeyLabel, weekdayName } from "./wrapped-number-format";
export { isPersonCounterparty } from "./wrapped-txn-rules";
export * from "./wrapped-thresholds";
export { WRAPPED_SLIDE_ORDER } from "./wrapped-types";
export type {
  ArchetypeId,
  WrappedContext,
  WrappedCoverage,
  WrappedDeck,
  WrappedFact,
  WrappedFactUnit,
  WrappedInput,
  WrappedSlide,
  WrappedSlideId,
} from "./wrapped-types";
