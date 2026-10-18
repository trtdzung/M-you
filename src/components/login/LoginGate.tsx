"use client";

import { useEffect, useState } from "react";
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

const AUTH_STORAGE_KEY = "msb-pfm.authenticated";

function readAuthenticated(): boolean {
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY) === "1";
  } catch {
    return false; // storage disabled (private mode) — fall back to login
  }
}

/**
 * The app's front door: renders `LoginScreen` until one of the sample
 * customers logs in, then switches the active persona to match and reveals
 * `children`. The login is remembered in localStorage (the persona is already
 * persisted by `PersonaProvider`), so a reload stays signed in. Settings provides
 * the logout affordance.
 */
export function LoginGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  // Until storage has been read we render nothing, so a signed-in user never
  // sees a flash of the login screen. Read after mount to keep SSR output stable.
  const [ready, setReady] = useState(false);
  const { persona, personas, setPersona } = usePersona();
  const router = useRouter();

  useEffect(() => {
    setAuthenticated(readAuthenticated());
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!authenticated) {
    const customers = personas.map((p) => ({ ...p, label: LOGIN_DISPLAY_NAME[p.cif] ?? p.label }));
    return (
      <LoginScreen
        customers={customers}
        initialCif={persona.cif}
        onLogin={(customer) => {
          setPersona(customer.id);
          setAuthenticated(true);
          try {
            window.localStorage.setItem(AUTH_STORAGE_KEY, "1");
          } catch {
            // ignore storage errors
          }
          // Login can be reached from any deep link (e.g. /transfer) — always
          // land on Trang chủ, matching the real MSB app's post-login behavior.
          router.push("/");
        }}
      />
    );
  }

  return <>{children}</>;
}
