// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const snapshotService = vi.hoisted(() => ({
  customerSnapshot: vi.fn(),
}));

vi.mock("@/lib/financial-snapshot-service", () => snapshotService);

import { GET } from "./route";

const call = (url: string) => GET(new NextRequest(url));

describe("Candidates Inspection API (GET /api/proactive-insights/candidates)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 404 for unknown customer cif", async () => {
    const res = await call("http://local/api/proactive-insights/candidates?cif=INVALID");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unknown customer");
    expect(body.availablePersonas).toBeDefined();
  });

  it("returns all prepared candidates and selected candidate for valid persona", async () => {
    snapshotService.customerSnapshot.mockReturnValue({
      snapshotId: "test-snapshot-hash",
      snapshot: {
        asOf: "2026-09-15T00:00:00Z",
        healthScore: { overallScore: 78, tier: "good" },
        candidates: [
          { id: "spending:jar:dining", priority: 1, severity: "urgent", title: "Hũ Ăn uống đang cần bù" },
          { id: "spike:spending", priority: 2, severity: "attention", title: "Chi tháng này đang tăng" },
        ],
      },
    });

    const res = await call("http://local/api/proactive-insights/candidates?cif=CIF_0001");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const body = await res.json();
    expect(body.cif).toBe("CIF_0001");
    expect(body.totalCandidates).toBe(2);
    expect(body.candidates.length).toBe(2);
    expect(body.selectedCandidate.id).toBe("spending:jar:dining");
    expect(body.healthScore.overallScore).toBe(78);
  });
});
