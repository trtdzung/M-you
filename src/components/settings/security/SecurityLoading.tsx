"use client";

/** Short empty frame while the Scam Shield store loads, so defaults never flash. */
export function SecurityLoading() {
  return <div aria-busy="true" aria-label="Đang tải cài đặt bảo mật" className="settings-panel h-40" />;
}
