/**
 * Provider factory. `getProviders(personaId)` returns the memoized mock
 * provider bundle for a persona. Callers depend only on the `Providers`
 * interface, never on the mock module internals or fixtures.
 */

import { generateDataset } from "./mock/fixtures/generate";
import { createMockProvider } from "./mock/mock-provider";
import { DEFAULT_PERSONA, PERSONAS, type PersonaId } from "./mock/personas";
import type { Providers } from "./interfaces";

const cache = new Map<PersonaId, Providers>();

export function getProviders(personaId: PersonaId = DEFAULT_PERSONA): Providers {
  const existing = cache.get(personaId);
  if (existing) return existing;
  const dataset = generateDataset(PERSONAS[personaId]);
  const provider = createMockProvider(dataset, personaId);
  cache.set(personaId, provider);
  return provider;
}

export type { Providers } from "./interfaces";
export { DEFAULT_PERSONA, PERSONAS, PERSONA_LIST } from "./mock/personas";
export type { PersonaId, PersonaMeta } from "./mock/personas";
