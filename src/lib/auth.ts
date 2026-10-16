/**
 * Demo login for the prototype: one fixed password shared by all 3 sample
 * customers (CIF_0001..0003, see `providers/mock/personas.ts`). Not real
 * authentication — the session-only gate (`LoginGate`) is what stands
 * between an unauthenticated visitor and the app.
 */
export const LOGIN_PASSWORD = "abc@123";

export interface LoginCustomer {
  cif: string;
  label: string;
}

export type LoginResult<T extends LoginCustomer> =
  | { ok: true; customer: T }
  | { ok: false; error: string };

export function validateLogin<T extends LoginCustomer>(
  cif: string,
  password: string,
  customers: T[],
): LoginResult<T> {
  const customer = customers.find((c) => c.cif === cif);
  if (!customer) {
    return { ok: false, error: "Vui lòng chọn khách hàng" };
  }
  if (password !== LOGIN_PASSWORD) {
    return { ok: false, error: "Sai mật khẩu, vui lòng thử lại" };
  }
  return { ok: true, customer };
}
