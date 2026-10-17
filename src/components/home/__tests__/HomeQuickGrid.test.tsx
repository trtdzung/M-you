import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeQuickGrid } from "../HomeQuickGrid";

describe("HomeQuickGrid", () => {
  it("links the Mục tiêu button to /goals", () => {
    render(<HomeQuickGrid />);
    expect(screen.getByRole("link", { name: /Mục tiêu/ })).toHaveAttribute(
      "href",
      "/goals",
    );
  });
});
