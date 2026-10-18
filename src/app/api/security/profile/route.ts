import { NextRequest, NextResponse } from "next/server";
import { readSavedProfile, sanitizeSecurityState, writeProfile } from "@/lib/security/profile-store";

/**
 * Scam Shield settings for one persona (`security_profiles`). Called by the
 * browser through `src/state/security/storage.ts`. Simulated data only: never
 * PINs, passwords or OTPs.
 */

const validCif = (cif: unknown): cif is string => typeof cif === "string" && cif.length > 0 && cif.length <= 64;

/** GET /api/security/profile?cif= → `{ state }`, `state: null` when the persona never saved one. */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!validCif(cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try {
    return NextResponse.json({ state: readSavedProfile(cif) });
  } catch (err) {
    console.error("GET /api/security/profile failed", err);
    return NextResponse.json({ error: "profile unavailable" }, { status: 500 });
  }
}

/** PUT /api/security/profile — body `{ cif, state }`; replaces the whole saved state. */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!validCif(body?.cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const state = sanitizeSecurityState(body?.state);
  if ("error" in state) return NextResponse.json({ error: state.error }, { status: 422 });
  try {
    writeProfile(body.cif, state);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/security/profile failed", err);
    return NextResponse.json({ error: "profile unavailable" }, { status: 500 });
  }
}
