/** Plain-language provenance labels (invariant #5), shared by every surface that names a source. */

import type { DataSource } from "@/domain/models";

export const SOURCE_FULL_LABEL: Record<DataSource, string> = {
  msb: "Dữ liệu từ MSB",
  self_reported: "Người dùng tự khai báo",
  estimated: "Giá trị ước tính",
  mock: "Dữ liệu demo",
};
