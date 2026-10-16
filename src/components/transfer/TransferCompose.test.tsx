import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { push, putDraft, providers } = vi.hoisted(() => ({
  push: vi.fn(),
  putDraft: vi.fn(),
  providers: {
    listBeneficiaries: async () => [{ id: "b1", name: "Lan Anh", accountNumber: "0281000556677", bankName: "MSB", source: "mock" }],
    listTransactions: async () => [],
    listAccounts: async () => [{ id: "current", type: "current", institution: "MSB", currency: "VND", balance: 20_000_000, availableBalance: 20_000_000, lastSyncedAt: "2026-01-01", source: "mock", maskedNumber: "•••• 1991" }],
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/transfer-draft-store", () => ({ putTransferDraft: putDraft }));
vi.mock("@/providers/context", () => ({
  useProviders: () => providers,
}));

import { TransferCompose } from "./TransferCompose";

describe("TransferCompose", () => {
  it("hands a validated saved recipient to mock confirmation without an account number", async () => {
    render(<TransferCompose />);
    fireEvent.click(await screen.findByRole("button", { name: /Lan Anh/ }));
    fireEvent.change(screen.getByLabelText("Số tiền (VND)"), { target: { value: "10000000" } });
    const continueButton = screen.getByRole("button", { name: /Tiếp tục/ });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    expect(putDraft).toHaveBeenCalledWith(expect.objectContaining({ name: "Lan Anh", accountMasked: "****6677", riskFlags: ["over_threshold"], recipientSource: "saved_beneficiary", source: "mock" }));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/transfer-confirm\?draftId=form_\d+&from=transfer$/));
  });
});
