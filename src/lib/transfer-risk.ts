import type { TransferRiskFlag } from "@/domain/models";

/** Amount at/above which a transfer is flagged over-threshold in the review UI. */
export const TRANSFER_THRESHOLD_VND = 10_000_000;

export function hitsThreshold(amount: number): boolean {
  return amount >= TRANSFER_THRESHOLD_VND;
}

export function assessTransferRisk({ amount, isNewPayee }: { amount: number; isNewPayee: boolean }): TransferRiskFlag[] {
  const flags: TransferRiskFlag[] = [];
  if (hitsThreshold(amount)) flags.push("over_threshold");
  if (isNewPayee) flags.push("new_payee");
  return flags;
}
