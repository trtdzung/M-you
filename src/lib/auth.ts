/**
 * Client-side customer selection validation for the prototype demo gate.
 * The shared demo password is verified server-side by `/api/login` using
 * an environment variable. This gate is not real authentication.
 */

export interface LoginCustomer {
  cif: string;
  label: string;
}

export type LoginResult<T extends LoginCustomer> =
  | { ok: true; customer: T }
  | { ok: false; error: string };

export function validateLogin<T extends LoginCustomer>(
  cif: string,
  customers: T[],
): LoginResult<T> {
  const customer = customers.find((c) => c.cif === cif);
  if (!customer) {
    return { ok: false, error: "Vui lòng chọn khách hàng" };
  }
  return { ok: true, customer };
}
