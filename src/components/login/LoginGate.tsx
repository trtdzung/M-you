"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePersona } from "@/providers/context";
import { LoginScreen } from "./LoginScreen";

/**
 * Login-screen display names for the sample customers — the short form of each
 * persona's `label` ("<name> — <financial profile>"); keep the two in sync.
 */
export const LOGIN_DISPLAY_NAME: Record<string, string> = {
  CIF_0001: "Ly Lã",
  CIF_0002: "Toàn Trần",
  CIF_0003: "Đào Nguyên",
};

/**
 * The app's front door: renders `LoginScreen` until one of the sample
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
