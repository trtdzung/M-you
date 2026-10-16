import { TRANSFER_THRESHOLD_VND } from "@/ai/config";
import type { TransferRiskFlag } from "@/domain/models";

export function hitsThreshold(amount: number): boolean {
  return amount >= TRANSFER_THRESHOLD_VND;
}

export function assessTransferRisk({ amount, isNewPayee }: { amount: number; isNewPayee: boolean }): TransferRiskFlag[] {
  const flags: TransferRiskFlag[] = [];
  if (hitsThreshold(amount)) flags.push("over_threshold");
  if (isNewPayee) flags.push("new_payee");
  return flags;
}
