"use client";

/**
 * Persona context. Holds the active prototype persona (persisted in
 * localStorage) and exposes the matching provider bundle. Screens call
 * `useProviders()` for data and `usePersona()` to read/switch persona.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getProviders, type Providers } from "./index";
import { DEFAULT_PERSONA, PERSONA_LIST, type PersonaId, type PersonaMeta } from "./mock/personas";

const STORAGE_KEY = "msb-pfm.persona";

interface PersonaContextValue {
  personaId: PersonaId;
  persona: PersonaMeta;
  personas: PersonaMeta[];
  setPersona: (id: PersonaId) => void;
  providers: Providers;
}

const PersonaContext = createContext<PersonaContextValue | null>(null);

function readStored(): PersonaId {
  if (typeof window === "undefined") return DEFAULT_PERSONA;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && PERSONA_LIST.some((p) => p.id === raw)) return raw as PersonaId;
  } catch {
    // ignore storage errors (private mode, disabled)
  }
  return DEFAULT_PERSONA;
}

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [personaId, setPersonaId] = useState<PersonaId>(DEFAULT_PERSONA);

  // Hydrate from storage after mount to keep SSR output stable.
  useEffect(() => {
    setPersonaId(readStored());
  }, []);

  const setPersona = useCallback((id: PersonaId) => {
    setPersonaId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore storage errors
    }
  }, []);

  const value = useMemo<PersonaContextValue>(() => {
    const persona = PERSONA_LIST.find((p) => p.id === personaId) ?? PERSONA_LIST[0];
    return {
      personaId,
      persona,
      personas: PERSONA_LIST,
      setPersona,
      providers: getProviders(personaId),
    };
  }, [personaId, setPersona]);

  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

function usePersonaContext(): PersonaContextValue {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error("usePersona/useProviders must be used within <PersonaProvider>");
  return ctx;
}

/** Active provider bundle for the selected persona. */
export function useProviders(): Providers {
  return usePersonaContext().providers;
}

/** Active persona plus switcher. */
export function usePersona(): Omit<PersonaContextValue, "providers"> {
  const { providers: _providers, ...rest } = usePersonaContext();
  return rest;
}
