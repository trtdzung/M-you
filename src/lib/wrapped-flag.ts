/**
 * Master switch for PFM Wrapped. Gates BOTH the `/wrapped` route (`notFound()` when
 * off) and the Tổng quan entry card, so turning it off removes every way in.
 * Typed `boolean` (not the literal) so a flipped constant never narrows branches.
 */
export const WRAPPED_ENABLED: boolean = true;
