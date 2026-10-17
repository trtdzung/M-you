"use client";

/**
 * The ordering machinery every server-backed resource provider runs on
 * (`jars.tsx`, `categories.tsx`): ONE serial request queue plus a generation
 * counter. Extracted so there is exactly one implementation of it — a second
 * resource inventing its own, subtly different variant is how out-of-order
 * responses get back in.
 *
 * **Queue (U13/K04):** the load and every mutation go out one at a time, in click
 * order, and their responses are applied in that same order — the final UI and
 * the DB both equal the LAST click, never whichever response happened to arrive
 * first.
 *
 * **Generation (K03):** bumped on persona switch / retry / unmount. A caller
 * captures `generation()` before its request and re-checks it after: a result
 * that belongs to a previous persona is dropped rather than painted over the new
 * one. `newGeneration()` also starts a FRESH queue, so the new persona's load
 * never waits behind the old persona's writes.
 */

import { useCallback, useMemo, useRef } from "react";

export interface SerialRequestQueue {
  /** Append `op` to the queue; resolves/rejects with `op`'s own result. */
  enqueue: <T>(op: () => Promise<T>) => Promise<T>;
  /** The live generation. Capture before a request, compare after. */
  generation: () => number;
  /** Start a new generation on an empty queue; returns the new value. */
  newGeneration: () => number;
}

export function useSerialRequestQueue(): SerialRequestQueue {
  const genRef = useRef(0);
  /** Tail of the queue. Never rejects — a failed op must not stall the rest. */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = useCallback(<T,>(op: () => Promise<T>): Promise<T> => {
    const task = queueRef.current.then(op);
    queueRef.current = task.catch(() => undefined);
    return task;
  }, []);

  const generation = useCallback(() => genRef.current, []);

  const newGeneration = useCallback(() => {
    queueRef.current = Promise.resolve();
    genRef.current += 1;
    return genRef.current;
  }, []);

  return useMemo(
    () => ({ enqueue, generation, newGeneration }),
    [enqueue, generation, newGeneration],
  );
}
