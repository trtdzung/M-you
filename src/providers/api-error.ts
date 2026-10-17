/**
 * Typed failure of a `/api/jars*`, `/api/jar-ledger` or `/api/categories*` call.
 * Carries the HTTP status and the server's JSON `{ error, overBy, usedBy,
 * maxWithdraw }` body — a 422 "over CASA cap" with the VND overage, a 422 "over
 * balance" with the most the jar can give back, a 409 "category in use" with the
 * number of records still pointing at it — so the calling state can show the user
 * WHY a write was refused instead of a bare "failed: 422" (U20). Transport-level:
 * no presentation copy lives here (see `state/*-error-message.ts` for that).
 */
export class ApiError extends Error {
  constructor(
    readonly op: string,
    readonly status: number,
    /** The server's `error` string when the body had one. */
    readonly serverMessage: string | null,
    /** VND over the CASA cap when the server reported it (422 over-cap). */
    readonly overBy: number | null,
    /** Records still referencing a category when the server refused a delete (409 in-use). */
    readonly usedBy: number | null,
    /** Most the jar can withdraw when a ledger batch was refused (422 over-balance); `null` = unknown/unfunded. */
    readonly maxWithdraw: number | null = null,
  ) {
    super(`${op} failed: ${status}${serverMessage ? ` (${serverMessage})` : ""}`);
    this.name = "ApiError";
  }

  get isOverCap(): boolean {
    return this.status === 422 && this.serverMessage === "over CASA cap";
  }

  get isOverBalance(): boolean {
    return this.status === 422 && this.serverMessage === "over balance";
  }
}

const finiteNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Build an `ApiError` from a non-ok response, tolerating a non-JSON body. */
export async function apiError(op: string, res: Response): Promise<ApiError> {
  let serverMessage: string | null = null;
  let overBy: number | null = null;
  let usedBy: number | null = null;
  let maxWithdraw: number | null = null;
  try {
    const body = (await res.json()) as Record<string, unknown> | null;
    if (typeof body?.error === "string") serverMessage = body.error;
    overBy = finiteNumber(body?.overBy);
    usedBy = finiteNumber(body?.usedBy);
    maxWithdraw = finiteNumber(body?.maxWithdraw);
  } catch {
    // Non-JSON error body (proxy/HTML 500) — status alone is still reported.
  }
  return new ApiError(op, res.status, serverMessage, overBy, usedBy, maxWithdraw);
}
