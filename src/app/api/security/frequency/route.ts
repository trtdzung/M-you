import { NextRequest, NextResponse } from "next/server";
import { clearFrequency, deleteFrequencyMark, listFrequencyMarks } from "@/lib/security/frequency-store";

const validCif = (cif: string | null): cif is string => !!cif && cif.length <= 64;

/** GET /api/security/frequency?cif= — marks already shown (or waiting) per scenario. */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!validCif(cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try {
    return NextResponse.json({ marks: listFrequencyMarks(cif) });
  } catch (err) {
    console.error("GET /api/security/frequency failed", err);
    return NextResponse.json({ error: "frequency unavailable" }, { status: 500 });
  }
}

/** DELETE /api/security/frequency?cif=&id= | ?cif=&all=1 — forget one mark, or every mark. */
export async function DELETE(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const cif = params.get("cif");
  if (!validCif(cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const id = params.get("id");
  const all = params.get("all") === "1";
  if (!all && !(id && id.length <= 80)) return NextResponse.json({ error: "id is invalid" }, { status: 422 });
  try {
    if (all) clearFrequency(cif);
    else if (!deleteFrequencyMark(cif, id!)) return NextResponse.json({ error: "mark not found" }, { status: 404 });
    return NextResponse.json({ marks: listFrequencyMarks(cif) });
  } catch (err) {
    console.error("DELETE /api/security/frequency failed", err);
    return NextResponse.json({ error: "frequency unavailable" }, { status: 500 });
  }
}
