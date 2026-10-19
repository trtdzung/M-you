import { NextRequest, NextResponse } from "next/server";
import { customerSnapshot } from "@/lib/financial-snapshot-service";
import { PERSONA_LIST } from "@/providers/mock/personas";

export const dynamic = "force-dynamic";

/**
 * Inspection endpoint for developer & QA verification:
 * Returns the entire customer snapshot candidates BEFORE single-insight dispatcher selection.
 *
 * Example: GET /api/proactive-insights/candidates?cif=CIF_0001
 */
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const requestedCif = url.searchParams.get("cif") || "CIF_0001";
    const persona = PERSONA_LIST.find((p) => p.cif === requestedCif || p.id === requestedCif);

    if (!persona) {
      return NextResponse.json(
        {
          error: "Unknown customer",
          availablePersonas: PERSONA_LIST.map((p) => ({ cif: p.cif, id: p.id, label: p.label })),
        },
        { status: 404 }
      );
    }

    const { snapshot, snapshotId } = customerSnapshot(persona.cif);

    return NextResponse.json(
      {
        cif: persona.cif,
        personaId: persona.id,
        personaLabel: persona.label,
        snapshotId,
        asOf: snapshot.asOf,
        totalCandidates: snapshot.candidates.length,
        healthScore: snapshot.healthScore,
        selectedCandidate: snapshot.candidates[0] ?? null,
        candidates: snapshot.candidates,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("GET /api/proactive-insights/candidates failed", error);
    return NextResponse.json(
      { error: "Không thể lấy danh sách candidates", detail: String(error) },
      { status: 500 }
    );
  }
}
