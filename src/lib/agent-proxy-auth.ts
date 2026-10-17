/**
 * Server-only credentials for the same-origin proxies to the M-Your agent backend
 * (`src/app/api/agent/*`). The browser only ever calls those routes, so
 * `AGENT_API_KEY` / Auth0 secrets never reach the client.
 */

export const AGENT_BASE_URL = process.env.AGENT_API_BASE_URL || "http://localhost:8080";
const API_KEY = process.env.AGENT_API_KEY || "";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || "";
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID || "";
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET || "";
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || "";

// Module-level cache: fetched once, reused across requests until it expires
// (per todo.md — never re-fetch a token on every call). Only used when
// AGENT_API_BASE_URL points at a GreenNode AgentBase Runtime; local/
// docker-compose (AUTH0_DOMAIN empty) skips this layer entirely.
let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken(): Promise<string | null> {
  if (!AUTH0_DOMAIN) return null;
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const res = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: AUTH0_CLIENT_ID,
      client_secret: AUTH0_CLIENT_SECRET,
      audience: AUTH0_AUDIENCE,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    throw new Error(`Auth0 token error ${res.status}`);
  }
  const { access_token, expires_in } = await res.json();
  cachedToken = access_token;
  cachedTokenExpiresAt = Date.now() + (expires_in - 60) * 1000;
  return cachedToken;
}

export async function agentAuthHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { "X-API-Key": API_KEY, ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
