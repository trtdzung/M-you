/** JSON `Response` for the test-side fetch stubs (`mock-*-fetch.ts`). */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
