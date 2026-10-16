import type { Account } from "@/domain/models";

/**
 * Overlay a jar-sourced-transfer debit ledger onto engine-computed account
 * balances. Pure — `Account.balance` itself stays the engine's output
 * (invariant #1); this only affects what's DISPLAYED. Shared by every read
 * site (`useFinancials`, `TransferCompose`) so the adjustment is applied
 * identically everywhere.
 */
export function applyAccountAdjustments(accounts: Account[], adjustments: Record<string, number>): Account[] {
  return accounts.map((account) => {
    const debited = adjustments[account.id];
    return debited ? { ...account, balance: account.balance - debited } : account;
  });
}
