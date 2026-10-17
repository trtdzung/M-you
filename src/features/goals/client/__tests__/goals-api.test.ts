import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addLedgerEntry,
  checkFeasibility,
  createGoal,
  deleteGoal,
  getGoal,
  listGoals,
  updateGoal,
} from "../goals-api";

const CIF = "a/b c&d";
const ID = "id/1";
const ENC_CIF = encodeURIComponent(CIF);
const ENC_ID = encodeURIComponent(ID);

afterEach(() => {
  vi.restoreAllMocks();
});

function ok(): Response {
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}

describe("goals-api", () => {
  it("calls the seven endpoints with the encoded cif and id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(ok()));
    const input = {
      name: "Mua nhà",
      targetAmount: 600_000_000,
      targetDate: "2029-09-15",
      flexibility: "flexible" as const,
      monthlyContribution: null,
      openingAmount: null,
    };

    await listGoals(CIF);
    await getGoal(CIF, ID);
    await createGoal(CIF, input);
    await updateGoal(CIF, ID, { status: "paused" });
    await deleteGoal(CIF, ID);
    await addLedgerEntry(CIF, ID, { kind: "deposit", amount: 5_000, note: null });
    await checkFeasibility(CIF, { targetAmount: 600_000_000, targetDate: "2029-09-15" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, `/api/goals?cif=${ENC_CIF}`, undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/goals/${ENC_ID}?cif=${ENC_CIF}`, undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cif: CIF, ...input }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, `/api/goals/${ENC_ID}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cif: CIF, status: "paused" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, `/api/goals/${ENC_ID}?cif=${ENC_CIF}`, {
      method: "DELETE",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(6, `/api/goals/${ENC_ID}/ledger`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cif: CIF, kind: "deposit", amount: 5_000, note: null }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(7, "/api/goals/feasibility", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cif: CIF,
        targetAmount: 600_000_000,
        targetDate: "2029-09-15",
      }),
    });
    expect(ENC_CIF).toBe("a%2Fb%20c%26d");
    expect(ENC_ID).toBe("id%2F1");
  });
});
