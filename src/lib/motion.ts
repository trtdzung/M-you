/** True only when the browser will actually show motion. Missing `matchMedia` (jsdom, SSR) is instant. */
export function prefersMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

/** Desktop preview zooms `.device-canvas`; pointer math has to undo that. */
export function canvasZoom(canvas?: HTMLElement | null): number {
  const el = canvas ?? (typeof document === "undefined" ? null : document.getElementById("device-canvas"));
  if (!el || !el.offsetHeight) return 1;
  const zoom = el.getBoundingClientRect().height / el.offsetHeight;
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}
