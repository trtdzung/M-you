import { redirect } from "next/navigation";

/** Route di dời (Red Team #8): `/cashflow` → `/pfm/cashflow`. Thin Server Component. */
export default function CashflowRedirect() {
  redirect("/pfm/cashflow");
}
