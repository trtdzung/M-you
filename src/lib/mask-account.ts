/** Display an account number safely by retaining only its final four digits. */
export function maskAccount(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  return `****${digits.slice(-4)}`;
}
