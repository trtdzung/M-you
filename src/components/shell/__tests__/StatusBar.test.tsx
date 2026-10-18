import { afterEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { StatusBar } from "../StatusBar";
afterEach(() => { vi.useRealTimers(); });
it("shows the device time and updates when the minute changes", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 14, 10, 59, 59));
  const view = render(<StatusBar />);
  expect(screen.getByLabelText("Giờ hiện tại")).toHaveTextContent("10:59");
  act(() => { vi.advanceTimersByTime(1000); });
  expect(screen.getByLabelText("Giờ hiện tại")).toHaveTextContent("11:00");
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
