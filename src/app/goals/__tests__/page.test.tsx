import { describe, expect, it, vi } from "vitest";
import GoalsPage from "../page";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

describe("/goals page", () => {
  it("redirects to the Mục tiêu tab of /pfm", () => {
    GoalsPage();
    expect(redirect).toHaveBeenCalledWith("/pfm?tab=goals");
  });
});
