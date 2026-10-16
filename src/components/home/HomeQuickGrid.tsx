import {
  ArrowUpRight,
  ScanLine,
  PiggyBank,
  CreditCard,
  ReceiptText,
  HandCoins,
  Award,
  PieChart,
  LayoutGrid,
} from "lucide-react";
import { QuickActions, type QuickAction } from "@/components/common/QuickActions";

/** Hành động demo chưa có màn riêng — no-op, giữ vỏ để khớp ref (source: mock). */
const noop = () => {};

/**
 * Khối quick-action Home MSB: lưới 3×2 (Chuyển tiền, Quét QR, Tiền gửi, Thẻ,
 * Thanh toán, Vay) + hàng chân Rewards · PFM · Xem thêm. Chuyển tiền → màn chuyển
 * tiền; PFM → hub PFM (lối vào PFM duy nhất từ Home). "Xem thêm" là placeholder
 * demo chưa có màn.
 */
const ACTIONS: QuickAction[] = [
  { label: "Chuyển tiền", icon: ArrowUpRight, href: "/transfer" },
  { label: "Quét QR", icon: ScanLine, onClick: noop },
  { label: "Tiền gửi", icon: PiggyBank, onClick: noop },
  { label: "Thẻ", icon: CreditCard, onClick: noop },
  { label: "Thanh toán", icon: ReceiptText, onClick: noop },
  { label: "Vay", icon: HandCoins, onClick: noop },
];

const FOOTER: QuickAction[] = [
  { label: "Rewards", icon: Award, onClick: noop },
  { label: "PFM", icon: PieChart, href: "/pfm" },
  { label: "Xem thêm", icon: LayoutGrid, onClick: noop },
];

export function HomeQuickGrid() {
  return <QuickActions actions={ACTIONS} footer={FOOTER} />;
}
