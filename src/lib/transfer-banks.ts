/**
 * Bank list for Chuyển tiền — used both for the "ngân hàng ngoài MSB" step
 * (choosing a recipient bank by account number) and for resolving a real
 * logo for a saved beneficiary's own bank. Static demo data — `source: mock`
 * per invariant #4/#5, not fetched from any real bank directory. Limited to
 * banks with a real logo asset under `public/logos/`.
 */

export interface TransferBank {
  id: string;
  name: string;
  logo: string;
}

export const TRANSFER_BANKS: TransferBank[] = [
  { id: "msb", name: "MSB", logo: "/logos/MSB.png" },
  { id: "vietcombank", name: "Vietcombank", logo: "/logos/Vietcom.png" },
  { id: "bidv", name: "BIDV", logo: "/logos/BIDV.png" },
  { id: "vietinbank", name: "VietinBank", logo: "/logos/Viettinbank.png" },
  { id: "techcombank", name: "Techcombank", logo: "/logos/Techcom.png" },
  { id: "mbbank", name: "MB Bank", logo: "/logos/MBB.png" },
  { id: "agribank", name: "Agribank", logo: "/logos/Agri.png" },
];

export function findBank(id: string): TransferBank | undefined {
  return TRANSFER_BANKS.find((b) => b.id === id);
}

/** Resolve a real logo for a bank name string (e.g. a beneficiary's `bankName`). */
export function findBankByName(name?: string): TransferBank | undefined {
  if (!name) return undefined;
  const normalized = name.trim().toLocaleLowerCase("vi");
  return TRANSFER_BANKS.find((b) => b.name.toLocaleLowerCase("vi") === normalized);
}
