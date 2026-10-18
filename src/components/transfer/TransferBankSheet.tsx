"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { TRANSFER_BANKS } from "@/lib/transfer-banks";

const BANK_DESCRIPTIONS: Record<string, string> = {
  msb: "Ngân hàng TMCP Hàng Hải",
  vietcombank: "Ngân hàng TMCP Ngoại thương Việt Nam",
  bidv: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam",
  vietinbank: "Ngân hàng TMCP Công thương Việt Nam",
  techcombank: "Ngân hàng TMCP Kỹ Thương Việt Nam",
  mbbank: "Ngân hàng TMCP Quân Đội",
  agribank: "Ngân hàng NN&PT Nông thôn Việt Nam",
};
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();

export function TransferBankSheet({ open = true, onClose, onSelect }: { open?: boolean; onClose: () => void; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const banks = TRANSFER_BANKS.filter((bank) => normalize(`${bank.name} ${BANK_DESCRIPTIONS[bank.id]}`).includes(normalize(query.trim())));
  return (
    <Sheet open={open} className="transfer-sheet transfer-bank-sheet" title="Chọn ngân hàng" onClose={onClose}>
      <label className="mb-3 flex h-12 items-center gap-3 rounded-[10px] border border-[#dfe5ee] bg-[#f7f8fa] px-4">
        <Search size={22} className="shrink-0 text-text" aria-hidden />
        <input aria-label="Tên ngân hàng" placeholder="Tên ngân hàng" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-[#a5adbc]" />
      </label>
      <ul className="flex flex-col divide-y divide-[#dfe5ee]">
        {banks.map((bank) => (
          <li key={bank.id}>
            <button type="button" aria-label={bank.name} onClick={() => onSelect(bank.id)} className="flex min-h-[76px] w-full items-center gap-4 py-4 text-left text-text focus-visible:outline-2 focus-visible:outline-primary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bank.logo} alt="" aria-hidden className="h-10 w-10 shrink-0 object-contain" />
              <span className="min-w-0"><span className="block text-lg font-semibold">{bank.name}</span><span className="mt-1 block text-[14px] leading-5 text-muted">{BANK_DESCRIPTIONS[bank.id]}</span></span>
            </button>
          </li>
        ))}
      </ul>
      {banks.length === 0 && <p role="status" className="py-6 text-center text-sm text-muted">Không tìm thấy ngân hàng phù hợp.</p>}
    </Sheet>
  );
}
