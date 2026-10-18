import { prefersMotion } from "./motion";

type ViewTransitionLike = {
  skipTransition: () => void;
  finished: Promise<void>;
};

const COMMIT_TIMEOUT_MS = 1500;

let pending: (() => void) | null = null;
let skipTimer = 0;

export function isNavigationTransitionPending(): boolean {
  return pending !== null;
}

/** Called from the root layout after a pathname commit, so the new snapshot is the new page. */
export function notifyNavigationCommitted(): void {
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
export function navigateWithTransition(go: () => void, direction: "forward" | "back"): void {
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
    transition.skipTransition();
  }, COMMIT_TIMEOUT_MS);
  void transition.finished.finally(() => {
    delete document.documentElement.dataset.vtDir;
  });
}

function viewTransitionStart(): ((update: () => Promise<void>) => ViewTransitionLike) | null {
  if (typeof document === "undefined") return null;
  const start = (document as Document & { startViewTransition?: (update: () => Promise<void>) => ViewTransitionLike }).startViewTransition;
  return typeof start === "function" ? start.bind(document) : null;
}
