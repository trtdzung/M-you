"use client";

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { Search } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/features/goals-preview/format-money";
import {
  hydrateMarket,
  instrumentsOf,
  MARKET_INSTRUMENTS,
  type MarketInstrument,
  type MarketKind,
} from "../../data/market";
import { seriesPriceAt, seriesPointAt, formatISODate } from "../../engine";
import type { ISODate } from "../../model/types";
import { input, label, listRow, ring, secondaryButton } from "./styles";

interface DirectoryItem {
  code: string;
  companyName: string;
  shortName: string | null;
  floor: string | null;
}
let directoryRequest: Promise<DirectoryItem[]> | undefined;
function loadDirectory(): Promise<DirectoryItem[]> {
  return directoryRequest ??= fetch("/api/goals-v2/market/stock-directory")
    .then(async response => {
      if (!response.ok) throw new Error("Directory unavailable");
      const body = await response.json();
      if (!Array.isArray(body.items)) throw new Error("Invalid directory");
      return body.items as DirectoryItem[];
    }).catch(() => []);
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
}

function looksLikeSymbol(query: string): boolean {
  return /^[A-Z0-9]{2,10}$/.test(query.trim().toUpperCase());
}

function sortedInstruments(kind: MarketKind): MarketInstrument[] {
  const list = instrumentsOf(kind);
  if (kind === "stock") return [...list].sort((a, b) => a.name.localeCompare(b.name, "en"));
  return list;
}

export function InstrumentPicker({
  kind,
  value,
  onChange,
  today,
  shiftPct = 0,
  onManualFund,
}: {
  kind: "stock" | "external_fund";
  value: string | undefined;
  onChange: (id: string) => void;
  today: ISODate;
  shiftPct?: number;
  /** Quỹ không có trong danh sách → chuyển sang tự khai giá trị. */
  onManualFund?: () => void;
}) {
  const [directory, setDirectory] = useState<DirectoryItem[]>([]);
  const [open, setOpen] = useState(false);
  // Sheet chạy lại hiệu ứng focus khi onClose đổi; giữ hàm ổn định để ô tìm kiếm không mất focus khi gõ.
  const close = useCallback(() => setOpen(false), []);
  const [query, setQuery] = useState("");
  const [checking, setChecking] = useState(false);
  const [addError, setAddError] = useState<string | undefined>();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const selected = value ? instrumentsOf(kind).find((m) => m.id === value) : undefined;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setAddError(undefined);
    // Sheet đưa focus vào nút đóng trong requestAnimationFrame; hiệu ứng của Sheet (con) chạy trước,
    // nên khung hình đăng ký ở đây chạy sau và ô tìm kiếm luôn giữ focus khi sheet mở.
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [open]);

  useEffect(() => {
    if (!open || kind !== "stock") return;
    let cancelled = false;
    void loadDirectory().then(items => { if (!cancelled) setDirectory(items); });
    return () => { cancelled = true; };
  }, [open, kind]);

  const all = sortedInstruments(kind).filter(m => kind !== "external_fund" || m.listed !== false);
  // Chưa gõ: chỉ các mã đã có giá ("Phổ biến"); gõ rồi mới tìm trong cả danh mục mã niêm yết.
  if (kind === "stock" && query.trim()) {
    for (const entry of directory) {
      const priced = all.find(m => m.name === entry.code);
      if (priced) {
        all[all.indexOf(priced)] = { ...priced, fullName: entry.companyName };
      } else {
        all.push({ id: `stock-${entry.code.toLowerCase()}`, kind: "stock", name: entry.code,
          fullName: entry.companyName, unit: "cổ phiếu", fractional: false, priceSeries: [] });
      }
    }
    all.sort((a, b) => a.name.localeCompare(b.name, "en"));
  }
  const q = fold(query.trim());
  // Mỗi từ khách gõ phải là đầu của một từ trong mã hoặc tên; mã bắt đầu bằng từ khoá xếp trước.
  const tokens = q.split(/\s+/).filter(Boolean);
  const matches = (m: MarketInstrument) => {
    const words = fold(`${m.name} ${m.fullName ?? ""}`).split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.every((t) => words.some((w) => w.startsWith(t)));
  };
  const filtered = q
    ? all.filter(matches).sort((a, b) => Number(fold(b.name).startsWith(tokens[0])) - Number(fold(a.name).startsWith(tokens[0])))
    : all;

  const symbolQuery = query.trim().toUpperCase();
  const showAddStock =
    kind === "stock" &&
    !checking &&
    looksLikeSymbol(symbolQuery) &&
    // Chỉ khi không có kết quả nào: còn kết quả thì khách chọn trong danh sách.
    filtered.length === 0;

  const heading = q ? "Kết quả" : kind === "stock" ? "Phổ biến" : "Tất cả quỹ";
  const placeholder = kind === "stock" ? "Tìm mã hoặc tên cổ phiếu" : "Tìm mã hoặc tên quỹ";
  const sheetTitle = kind === "stock" ? "Chọn mã cổ phiếu" : "Chọn chứng chỉ quỹ";

  const pick = (m: MarketInstrument) => {
    if (kind === "stock" && m.priceSeries.length === 0) {
      void addSymbol(m.name);
      return;
    }
    onChange(m.id);
    setOpen(false);
  };

  const addSymbol = async (symbol = symbolQuery) => {
    if (checking) return;
    setChecking(true);
    setAddError(undefined);
    try {
      const res = await fetch("/api/goals-v2/market/instruments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const body = (await res.json().catch(() => null)) as { instrument?: MarketInstrument; error?: string } | null;
      if (res.ok && body?.instrument) {
        const added = body.instrument;
        hydrateMarket([...MARKET_INSTRUMENTS.filter((m) => m.id !== added.id), added]);
        onChange(added.id);
        setOpen(false);
      } else {
        setAddError(body?.error ?? "Chưa kiểm tra được mã cổ phiếu lúc này. Bạn thử lại sau nhé.");
      }
    } catch {
      setAddError("Chưa kiểm tra được mã cổ phiếu lúc này. Bạn thử lại sau nhé.");
    } finally {
      setChecking(false);
    }
  };

  const unitPrice = (m: MarketInstrument) => seriesPriceAt(m.priceSeries, today, shiftPct);
  const priceLabel = (price: number) => formatVnd(price);

  if (selected) {
    const price = unitPrice(selected);
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-muted/40 px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-bold text-text">{selected.name}</p>
            {selected.fullName && <p className="mt-0.5 truncate text-[13px] text-muted">{selected.fullName}</p>}
            <p className="mt-1.5 text-[13px] tabular-nums text-muted">
              {kind === "stock" ? "Giá đóng cửa ngày" : "NAV ngày"} {formatISODate(seriesPointAt(selected.priceSeries, today)?.date).slice(0, 5)}: {priceLabel(price)}/{selected.unit}
            </p>
          </div>
          <button type="button" className={cn(secondaryButton, "!min-h-11 !w-auto shrink-0 !px-4")} onClick={() => setOpen(true)}>
            Đổi
          </button>
        </div>
        <InstrumentSheet
          open={open}
          title={sheetTitle}
          searchId={searchId}
          searchRef={searchRef}
          query={query}
          placeholder={placeholder}
          heading={heading}
          filtered={filtered}
          showAddStock={showAddStock}
          checking={checking}
          addError={addError}
          symbolQuery={symbolQuery}
          kind={kind}
          onClose={close}
          onQuery={(v) => {
            setQuery(v);
            setAddError(undefined);
          }}
          onPick={pick}
          onAddSymbol={() => { void addSymbol(); }}
          onManualFund={onManualFund}
          unitPrice={unitPrice}
          priceLabel={priceLabel}
        />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(input, "flex items-center gap-2.5 text-left text-muted")}
        aria-haspopup="dialog"
      >
        <Search size={18} className="shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{placeholder}</span>
      </button>
      <InstrumentSheet
        open={open}
        title={sheetTitle}
        searchId={searchId}
        searchRef={searchRef}
        query={query}
        placeholder={placeholder}
        heading={heading}
        filtered={filtered}
        showAddStock={showAddStock}
        checking={checking}
        addError={addError}
        symbolQuery={symbolQuery}
        kind={kind}
        onClose={close}
        onQuery={(v) => {
          setQuery(v);
          setAddError(undefined);
        }}
        onPick={pick}
        onAddSymbol={() => { void addSymbol(); }}
        onManualFund={onManualFund}
        unitPrice={unitPrice}
        priceLabel={priceLabel}
      />
    </>
  );
}

function InstrumentSheet({
  open,
  title,
  searchId,
  searchRef,
  query,
  placeholder,
  heading,
  filtered,
  showAddStock,
  checking,
  addError,
  symbolQuery,
  kind,
  onClose,
  onQuery,
  onPick,
  onAddSymbol,
  onManualFund,
  unitPrice,
  priceLabel,
}: {
  open: boolean;
  title: string;
  searchId: string;
  searchRef: RefObject<HTMLInputElement | null>;
  query: string;
  placeholder: string;
  heading: string;
  filtered: MarketInstrument[];
  showAddStock: boolean;
  checking: boolean;
  addError?: string;
  symbolQuery: string;
  kind: "stock" | "external_fund";
  onClose: () => void;
  onQuery: (v: string) => void;
  onPick: (m: MarketInstrument) => void;
  onAddSymbol: () => void;
  onManualFund?: () => void;
  unitPrice: (m: MarketInstrument) => number;
  priceLabel: (price: number) => string;
}) {
  const emptyAfterSearch = query.trim() !== "" && filtered.length === 0 && !showAddStock && !checking;
  /** Không có kết quả (kể cả danh sách quỹ trống) → cho phép tự khai. */
  const showManualFund = kind === "external_fund" && !checking && filtered.length === 0;

  return (
    // Chiều cao cố định: sheet không co giãn theo số kết quả khi khách gõ.
    <Sheet open={open} title={title} onClose={onClose} className="h-[88dvh]" bodyClassName="flex flex-1 flex-col !overflow-hidden !pb-0 !pt-3">
      <div className="flex shrink-0 flex-col gap-2 pb-3">
        <label htmlFor={searchId} className={label}>
          {kind === "stock" ? "Tìm cổ phiếu" : "Tìm quỹ"}
        </label>
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={searchRef}
            id={searchId}
            className={cn(input, "pl-10")}
            value={query}
            placeholder={placeholder}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => onQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(16px+var(--safe-area-bottom,0px))]">
        {checking && <p className="px-1 py-3 text-sm text-muted">Đang kiểm tra…</p>}

        {!checking && filtered.length > 0 && (
          <>
            <p className="px-1 pb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">{heading}</p>
            <ul className="flex flex-col">
              {filtered.map((m) => {
                const price = unitPrice(m);
                const displayPrice = kind === "stock" && m.priceSeries.length === 0 ? "Chưa có giá" : priceLabel(price);
                const aria = `${m.name}${m.fullName ? `, ${m.fullName}` : ""}, giá ${displayPrice}`;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-label={aria}
                      onClick={() => onPick(m)}
                      className={cn(listRow, "!min-h-11 !gap-2 !px-1")}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-text">{m.name}</p>
                        {m.fullName && <p className="truncate text-[13px] text-muted">{m.fullName}</p>}
                      </div>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-text">{displayPrice}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {showAddStock && (
          <button
            type="button"
            disabled={checking}
            onClick={onAddSymbol}
            className={cn(listRow, "!min-h-11 !px-1 text-primary-strong")}
            aria-label={`Thêm mã ${symbolQuery} — kiểm tra trên sàn`}
          >
            Thêm mã {symbolQuery} — kiểm tra trên sàn
          </button>
        )}

        {addError && <p className="px-1 py-2 text-sm text-negative">{addError}</p>}

        {emptyAfterSearch && kind === "stock" && (
          <p className="px-1 py-3 text-sm text-muted">Không tìm thấy mã khớp. Nhập đúng mã sàn (2–10 ký tự) để kiểm tra thêm.</p>
        )}

        {showManualFund && (
          <div className="flex flex-col gap-3 px-1 py-3">
            <p className="text-sm text-muted">Quỹ này chưa có giá tự động.</p>
            {onManualFund && (
              <button
                type="button"
                className={cn(secondaryButton, ring)}
                onClick={() => {
                  onClose();
                  onManualFund();
                }}
              >
                Tự khai giá trị
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
