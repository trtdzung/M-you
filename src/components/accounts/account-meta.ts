import { Wallet, PiggyBank, CreditCard, type LucideIcon } from "lucide-react";
import type { AccountType } from "@/domain/models";

/** Nhãn tiếng Việt + icon theo loại tài khoản (dùng chung list + detail). */
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  current: "Tài khoản thanh toán",
  savings: "Tài khoản tiết kiệm",
  credit_card: "Thẻ tín dụng",
};

export const ACCOUNT_TYPE_ICON: Record<AccountType, LucideIcon> = {
  current: Wallet,
  savings: PiggyBank,
  credit_card: CreditCard,
};
