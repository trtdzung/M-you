import { redirect } from "next/navigation";

/** Route di dời (Red Team #8): `/wealth` → `/pfm/wealth`. Thin Server Component. */
export default function WealthRedirect() {
  redirect("/pfm/wealth");
}
