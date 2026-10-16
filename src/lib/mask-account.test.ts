import { describe, expect, it } from "vitest";
import { maskAccount } from "./mask-account";

describe("maskAccount", () => {
  it("retains only the final four digits", () => {
    expect(maskAccount("0281 0005 56677")).toBe("****6677");
  });
});
