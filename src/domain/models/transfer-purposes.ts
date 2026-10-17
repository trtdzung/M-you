/**
 * Transfer-purpose taxonomy — a SEPARATE label dimension for `type:"transfer"`
 * transactions ("why did I send this money"), deliberately kept OUT of the
 * spending `CATEGORIES` so it can never be confused with a spending category.
 *
 * Hybrid counting rule (invariant #6): a purpose is pure metadata by default and
 * does NOT affect income/expense totals. A purpose flagged `spending: true` maps
 * to a real expense category — but it only ever *counts* once the USER confirms
 * it (the accept flow flips the txn `type` to expense and sets `mapsToCategoryId`).
 * An AI-suggested purpose is always pending and never mutates the record on its
 * own, so the engine keeps excluding the transfer until the human decides.
 */

export interface TransferPurposeDef {
  id: string;
  label: string;
  /** True ⇒ this transfer is really a spend; confirming it counts as expense. */
  spending: boolean;
  /** The expense category to reclassify into on confirm — only for `spending`. */
  mapsToCategoryId?: string;
}

export const TRANSFER_PURPOSES: TransferPurposeDef[] = [
  { id: "family", label: "Gia đình / người thân", spending: false },
  { id: "savings", label: "Tiết kiệm / đầu tư", spending: false },
  { id: "debt", label: "Trả nợ / cho vay", spending: false },
  { id: "self", label: "Chuyển giữa ví của tôi", spending: false },
  { id: "gift", label: "Biếu tặng", spending: false },
  { id: "business", label: "Kinh doanh", spending: false },
  { id: "rent", label: "Tiền nhà", spending: true, mapsToCategoryId: "housing" },
  { id: "bill_split", label: "Chia tiền (ăn/nhóm)", spending: true, mapsToCategoryId: "dining" },
  { id: "pay_goods", label: "Trả tiền mua đồ/dịch vụ", spending: true, mapsToCategoryId: "shopping" },
  { id: "other", label: "Khác", spending: false },
];

const TRANSFER_PURPOSE_BY_ID: Record<string, TransferPurposeDef> = Object.fromEntries(
  TRANSFER_PURPOSES.map((p) => [p.id, p]),
);

/** A valid, known purpose id (used to validate every AI/memory suggestion). */
export function isTransferPurpose(id: string): boolean {
  return id in TRANSFER_PURPOSE_BY_ID;
}

/** Whether confirming this purpose reclassifies the transfer into a spend. */
export function isSpendingPurpose(id: string): boolean {
  return TRANSFER_PURPOSE_BY_ID[id]?.spending === true;
}

/**
 * The expense category a spending purpose reclassifies into, if any.
 *
 * `assignable` is the persona's live assignable set. The mapping above is
 * preset-only by design (the purpose taxonomy is system-owned), but a persona can
 * ARCHIVE the preset it points at — and labelling a transaction with a category
 * hidden from every picker would leave the user unable to see or change it. With
 * the set passed, an archived/unknown target resolves to `undefined`, i.e. "leave
 * it a transfer + keep the purpose metadata": honest, reversible, and it never
 * moves a number behind the user's back (invariant #6). Omitted, the preset
 * mapping is returned unfiltered (engine/tests that have no persona in hand).
 */
export function purposeCategoryId(id: string, assignable?: ReadonlySet<string>): string | undefined {
  const mapped = TRANSFER_PURPOSE_BY_ID[id]?.mapsToCategoryId;
  if (mapped === undefined) return undefined;
  return !assignable || assignable.has(mapped) ? mapped : undefined;
}

export function transferPurposeLabel(id: string): string {
  return TRANSFER_PURPOSE_BY_ID[id]?.label ?? id;
}
