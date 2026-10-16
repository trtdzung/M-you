"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePersona } from "@/providers/context";
import { LoginScreen } from "./LoginScreen";

/**
 * Login-screen display names for the 3 sample customers — distinct from each
 * persona's `label` (a financial-profile description used elsewhere, e.g. the
 * Settings persona switcher), so that switcher keeps its own copy untouched.
 */
const LOGIN_DISPLAY_NAME: Record<string, string> = {
  CIF_0001: "Ly Lã",
  CIF_0002: "Toàn Trần",
  CIF_0003: "Đào Nguyên",
};

/**
 * The app's front door: renders `LoginScreen` until one of the 3 sample
 * customers logs in, then switches the active persona to match and reveals
 * `children`. Session-only (plain `useState`, no localStorage) — a reload
 * always starts back at login, and there is no logout affordance.
 */
export function LoginGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const { personas, setPersona } = usePersona();
  const router = useRouter();

  if (!authenticated) {
    const customers = personas.map((p) => ({ ...p, label: LOGIN_DISPLAY_NAME[p.cif] ?? p.label }));
    return (
      <LoginScreen
        customers={customers}
        onLogin={(customer) => {
          setPersona(customer.id);
          setAuthenticated(true);
          // Login can be reached from any deep link (e.g. /transfer) — always
          // land on Trang chủ, matching the real MSB app's post-login behavior.
          router.push("/");
        }}
      />
    );
  }

  return <>{children}</>;
}
