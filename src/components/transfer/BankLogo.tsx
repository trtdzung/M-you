import type { TransferBank } from "@/lib/transfer-banks";

/** Real bank-logo chip, shared by the bank picker and any recipient row whose bank is known. */
export function BankLogo({ bank, size = "sm" }: { bank: TransferBank; size?: "sm" | "md" }) {
  const dimension = size === "md" ? "h-9 w-9" : "h-8 w-8";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={bank.logo}
      alt=""
      aria-hidden
      className={`${dimension} shrink-0 rounded-full bg-white object-contain p-1 ring-1 ring-border`}
    />
  );
}
