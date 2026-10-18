"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";

/** Keeps the last value so a sheet can finish exiting after its source is cleared. */
export function useRetained<T>(value: T | null | undefined): T | null {
  const ref = useRef<T | null>(null);
  if (value != null) ref.current = value;
  return ref.current;
}

/**
 * Mounts children the first time `open` is true, keeps that instance while it
 * closes (Sheet animates out), and remounts on the next open so a draft does
 * not come back.
 */
export function SheetSlot({ open, children }: { open: boolean; children: ReactNode }) {
  const [generation, setGeneration] = useState(0);
  const wasOpen = useRef(false);
  const opening = open && !wasOpen.current;
  if (opening) {
    wasOpen.current = true;
    setGeneration((current) => current + 1);
  }
  if (!open) wasOpen.current = false;
  if (generation === 0 || opening) return null;
  return <Fragment key={generation}>{children}</Fragment>;
}
