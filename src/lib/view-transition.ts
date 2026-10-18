import { prefersMotion } from "./motion";
import { navigationDirection } from "./navigation-direction";

type ViewTransitionLike = {
  skipTransition: () => void;
  finished: Promise<void>;
  ready?: Promise<void>;
};

const COMMIT_TIMEOUT_MS = 1500;

let pending: (() => void) | null = null;
let skipTimer = 0;

export function isNavigationTransitionPending(): boolean {
  return pending !== null;
}

/** Called from the root layout after a pathname commit, so the new snapshot is the new page. */
export function notifyNavigationCommitted(): void {
  const main = document.getElementById("main-content");
  if (main) main.scrollTop = 0;
  if (skipTimer) {
    window.clearTimeout(skipTimer);
    skipTimer = 0;
  }
  const resolve = pending;
  pending = null;
  resolve?.();
}

/**
 * Slide between two routes. `router.push` does not update the DOM before it
 * returns, so the view-transition callback stays pending until the pathname commits.
 * A second call while that is in flight is ignored. No API, or reduced motion: navigate immediately.
 */
export function navigateWithTransition(go: () => void, direction: "forward" | "back" | "fade"): void {
  const start = viewTransitionStart();
  if (!start || !prefersMotion() || pending) {
    if (!pending) go();
    return;
  }

  document.documentElement.dataset.vtDir = direction;
  const transition = start(
    () =>
      new Promise<void>((resolve) => {
        pending = resolve;
        go();
      }),
  );
  skipTimer = window.setTimeout(() => {
    skipTimer = 0;
    const resolve = pending;
    pending = null;
    resolve?.();
    try {
      transition.skipTransition();
    } catch {
      // The route committed just as the cap fired; the animation is already done.
    }
  }, COMMIT_TIMEOUT_MS);
  // A slow commit calls `skipTransition`, which rejects both promises. Catch them
  // so the dev overlay does not treat that as an app error.
  void transition.ready?.catch(() => {});
  void transition.finished.catch(() => {}).finally(() => {
    delete document.documentElement.dataset.vtDir;
  });
}

/** `router.push` with a slide, or a crossfade between home tabs. Query swaps stay instant. */
export function pushWithTransition(push: (href: string, options?: { scroll?: boolean }) => void, href: string): void {
  if (typeof window === "undefined") {
    push(href);
    return;
  }
  const url = new URL(href, window.location.href);
  const direction = navigationDirection(
    `${window.location.pathname}${window.location.search}`,
    `${url.pathname}${url.search}`,
  );
  if (direction === "none") {
    push(href);
    return;
  }
  // Next scrolls after the view-transition callback, which aborts the animation.
  // `#main-content` is reset to the top inside `notifyNavigationCommitted` instead.
  navigateWithTransition(() => push(href, { scroll: false }), direction);
}

/** Same slide as a pushed screen's back control. */
export function backWithTransition(go: () => void): void {
  navigateWithTransition(go, "back");
}

function viewTransitionStart(): ((update: () => Promise<void>) => ViewTransitionLike) | null {
  if (typeof document === "undefined") return null;
  const start = (document as Document & { startViewTransition?: (update: () => Promise<void>) => ViewTransitionLike }).startViewTransition;
  return typeof start === "function" ? start.bind(document) : null;
}
