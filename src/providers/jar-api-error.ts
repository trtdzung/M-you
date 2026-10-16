/**
 * Typed failure of a `/api/jars*` call. Carries the HTTP status and the server's
 * JSON `{ error, overBy }` body (e.g. a 422 "over CASA cap" with the VND overage)
 * so the jar state can show the user WHY a write was refused instead of a bare
 * "failed: 422" (U20). Transport-level: no presentation copy lives here.
 */
export class JarApiError extends Error {
  constructor(
    readonly op: string,
    readonly status: number,
    /** The server's `error` string when the body had one. */
    readonly serverMessage: string | null,
    /** VND over the CASA cap when the server reported it (422 over-cap). */
    readonly overBy: number | null,
  ) {
    super(`${op} failed: ${status}${serverMessage ? ` (${serverMessage})` : ""}`);
    this.name = "JarApiError";
  }

  get isOverCap(): boolean {
    return this.status === 422 && this.serverMessage === "over CASA cap";
  }
}

/** Build a `JarApiError` from a non-ok response, tolerating a non-JSON body. */
export async function jarApiError(op: string, res: Response): Promise<JarApiError> {
  let serverMessage: string | null = null;
  let overBy: number | null = null;
  try {
    const body = (await res.json()) as { error?: unknown; overBy?: unknown } | null;
    if (typeof body?.error === "string") serverMessage = body.error;
    if (typeof body?.overBy === "number" && Number.isFinite(body.overBy)) overBy = body.overBy;
  } catch {
    // Non-JSON error body (proxy/HTML 500) — status alone is still reported.
  }
  return new JarApiError(op, res.status, serverMessage, overBy);
}
