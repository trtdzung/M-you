import { describe, expect, it, vi, afterEach } from "vitest";
import { createRemoteClassify } from "../remote-classifier";
import type { ClassifyInput } from "../types";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

const inputs: ClassifyInput[] = [
  { txnId: "a", merchant: "Highlands Coffee", amount: 50_000, direction: "debit", type: "expense" },
];

describe("createRemoteClassify", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs {user_id, items} to /api/agent/categorize", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ results: [{ txnId: "a", categoryId: "dining", confidence: 0.9 }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createRemoteClassify("CIF_0001")(inputs);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/agent/categorize");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ user_id: "CIF_0001", items: inputs });
  });

  it("returns shape-filtered ClassifyResult[] on a 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          { txnId: "a", categoryId: "dining", confidence: 0.9 },
          { categoryId: "dining", confidence: 0.9 }, // missing txnId — dropped
          { txnId: "b", categoryId: 42, confidence: 0.9 }, // categoryId not a string — dropped
          { txnId: "c", categoryId: "groceries" }, // missing confidence -> defaults to 0
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await createRemoteClassify("CIF_0001")(inputs);
    expect(results).toEqual([
      { txnId: "a", categoryId: "dining", confidence: 0.9 },
      { txnId: "c", categoryId: "groceries", confidence: 0 },
    ]);
  });

  it("returns [] when called with an empty input batch (nothing to classify)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const results = await createRemoteClassify("CIF_0001")([]);
    expect(results).toEqual([]);
  });

  it("throws when a NON-EMPTY batch gets a 200 but zero usable results back (truncation guard)", async () => {
    // A 200 with {results:[]} (or malformed/missing results) for a non-empty
    // input batch must be treated as a failure, not a silent no-op — this is
    // what makes the orchestrator's chunk-error / heuristic fallback fire
    // instead of quietly producing no suggestions.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createRemoteClassify("CIF_0001")(inputs)).rejects.toThrow(/no usable results/);
  });

  it("throws when results is missing or malformed entirely for a non-empty batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ notResults: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createRemoteClassify("CIF_0001")(inputs)).rejects.toThrow(/no usable results/);
  });

  it("throws on a 501 response (offline — triggers the orchestrator's heuristic fallback)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "categorizer offline" }, false, 501));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createRemoteClassify("CIF_0001")(inputs)).rejects.toThrow(/501/);
  });

  it("throws on a 500 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, false, 500));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createRemoteClassify("CIF_0001")(inputs)).rejects.toThrow(/500/);
  });

  it("throws when the fetch call itself rejects (network failure)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network unreachable"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createRemoteClassify("CIF_0001")(inputs)).rejects.toThrow(/network unreachable/);
  });
});
