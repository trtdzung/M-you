"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Portals floating UI (toasts, test panel button) into the phone frame
 * (`#device-canvas`), like `Sheet` does — `position: fixed` breaks under the
 * desktop preview's `zoom`.
 */
export function DeviceOverlay({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.getElementById("device-canvas") ?? document.body);
  }, []);
  return container ? createPortal(children, container) : null;
}
