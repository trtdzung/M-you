import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatVnd } from "@/lib/format";
import { GOALS_COPY } from "../../copy";
import { ContributeSheet } from "../ContributeSheet";
import { parseAmount } from "../parse-amount";
import { phraseMatches } from "../CommitmentPhraseInput";
import { WithdrawSheet } from "../WithdrawSheet";

describe("parseAmount", () => {
  it("returns nothing for a blank field, an error for junk or zero, and a value for a positive amount", () => {
    expect(parseAmount("  ")).toEqual({});
    expect(parseAmount("abc").error).toBe("Chỉ nhập số tiền, vd 5.000.000");
    expect(parseAmount("0")).toEqual({ error: "Số tiền phải lớn hơn 0" });
    expect(parseAmount("5.000.000")).toEqual({ value: 5_000_000 });
  });
});

describe("phraseMatches", () => {
  it("trims and ignores case", () => {
    const phrase = "Tôi chấp nhận lùi mục tiêu Mua nhà";
    expect(phraseMatches(`  ${phrase.toUpperCase()}  `, phrase)).toBe(true);
    expect(phraseMatches("Tôi chấp nhận", phrase)).toBe(false);
    expect(phraseMatches(`${phrase} `, phrase)).toBe(true);
  });
});

describe("WithdrawSheet", () => {
  const phrase = "Tôi chấp nhận lùi mục tiêu Mua nhà";

  it("keeps Rút disabled until the phrase and the amount are both valid", async () => {
    const onSubmit = vi.fn();
    render(
      <WithdrawSheet
        goalName="Mua nhà"
        currentAmount={10_000_000}
        monthlyPace={3_100_000}
        pending={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    const button = await screen.findByRole("button", { name: "Rút" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "5000000" } });
    fireEvent.change(screen.getByLabelText("Gõ lại câu sau để xác nhận rút:"), {
      target: { value: "sai câu" },
    });
    expect(button).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Gõ lại câu sau để xác nhận rút:"), {
      target: { value: `  ${phrase.toLowerCase()}  ` },
    });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledWith({ amount: 5_000_000, note: phrase });
  });

  it("shows Vượt số đã góp and locks the button when the amount exceeds the balance", async () => {
    render(
      <WithdrawSheet
        goalName="Mua nhà"
        currentAmount={1_000}
        monthlyPace={null}
        pending={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(await screen.findByLabelText("Số tiền"), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText("Gõ lại câu sau để xác nhận rút:"), {
      target: { value: phrase },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Vượt số đã góp");
    expect(screen.getByRole("button", { name: "Rút" })).toBeDisabled();
  });

  it("mentions only the amount when the pace is unknown", async () => {
    render(
      <WithdrawSheet
        goalName="Mua nhà"
        currentAmount={10_000_000}
        monthlyPace={null}
        pending={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(await screen.findByLabelText("Số tiền"), { target: { value: "5000000" } });
    expect(
      screen.getByText(GOALS_COPY.withdrawTradeoff(formatVnd(5_000_000), "unknown")),
    ).toBeInTheDocument();
    expect(screen.queryByText(/tuần/)).not.toBeInTheDocument();
  });
});

describe("ContributeSheet", () => {
  it("submits a positive amount and stays disabled while empty", async () => {
    const onSubmit = vi.fn();
    render(<ContributeSheet pending={false} onSubmit={onSubmit} onClose={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "Góp" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "15000" } });
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledWith(15_000);
  });
});
