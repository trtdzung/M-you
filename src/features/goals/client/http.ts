export type FetchResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** HTTP status; 0 on network failure. */
      status: number;
      error?: string;
      errors?: Record<string, string>;
    };

/** Never throws: 4xx/5xx and network failures come back as `{ ok: false }`. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<FetchResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: 0 };
  }
  if (res.ok) {
    if (res.status === 204) return { ok: true, data: undefined as T };
    try {
      return { ok: true, data: (await res.json()) as T };
    } catch {
      return { ok: false, status: res.status };
    }
  }
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    errors?: Record<string, string>;
  } | null;
  return { ok: false, status: res.status, error: body?.error, errors: body?.errors };
}

export function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
