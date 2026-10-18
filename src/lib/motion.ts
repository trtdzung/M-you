/** True only when the browser will actually show motion. Missing `matchMedia` (jsdom, SSR) is instant. */
export function prefersMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}
