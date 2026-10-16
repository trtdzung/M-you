import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Beneficiary } from "@/domain/models";

/**
 * Saved-recipient accounts, per persona (`cif`), backed by `data/pfm.sqlite3`
 * (see `data/schema.md`). Called by the browser only — `src/providers/mock/
 * mock-provider.ts` is the sole caller (architectural invariant #4: UI never
 * touches the storage layer directly, always through the provider).
 */

interface BeneficiaryRow {
  id: string;
  cif: string;
  name: string;
  account_number: string;
  bank_name: string;
  source: Beneficiary["source"];
  created_at: string;
}

function toBeneficiary(row: BeneficiaryRow): Beneficiary {
  return { id: row.id, name: row.name, accountNumber: row.account_number, bankName: row.bank_name, source: row.source };
}

function listForCif(cif: string): Beneficiary[] {
  const rows = getDb()
    .prepare("SELECT * FROM beneficiaries WHERE cif = ? ORDER BY created_at ASC")
    .all(cif) as BeneficiaryRow[];
  return rows.map(toBeneficiary);
}

export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) {
    return NextResponse.json({ error: "cif is required" }, { status: 422 });
  }
  return NextResponse.json(listForCif(cif));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { cif, name, accountNumber, bankName } = body ?? {};
  if (!cif || !name || !accountNumber || !bankName) {
    return NextResponse.json({ error: "cif, name, accountNumber and bankName are required" }, { status: 422 });
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM beneficiaries WHERE cif = ? AND bank_name = ? AND account_number = ?")
    .get(cif, bankName, accountNumber) as { id: string } | undefined;

  if (existing) {
    // Already saved — a re-save with the same account just updates the display name.
    db.prepare("UPDATE beneficiaries SET name = ? WHERE id = ?").run(name, existing.id);
  } else {
    // A hand-typed account number is never bank-verified (architectural invariant #5).
    db.prepare(
      `INSERT INTO beneficiaries (id, cif, name, account_number, bank_name, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'self_reported', ?)`,
    ).run(`b_user_${Date.now()}`, cif, name, accountNumber, bankName, new Date().toISOString());
  }

  return NextResponse.json(listForCif(cif), { status: existing ? 200 : 201 });
}
