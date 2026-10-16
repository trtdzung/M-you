"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { JarSetup } from "@/components/jars/JarSetup";

/**
 * Thiết lập hũ chi tiêu — a dedicated setup route (keeps the PFM tabs at four).
 * CRUD, category assignment, and allocation live here; changes auto-persist and
 * reflect immediately in the Cashflow "Hũ chi tiêu" section. No money movement.
 */
export default function JarsSetupPage() {
  return (
    <div>
      <ScreenHeader
        title="Hũ chi tiêu"
        subtitle="Thiết lập hũ và phân bổ theo hạng mục"
        action={
          <Link
            href="/pfm?tab=cashflow"
            aria-label="Quay lại Dòng tiền"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary"
          >
            <ArrowLeft size={16} /> Dòng tiền
          </Link>
        }
      />
      <JarSetup />
    </div>
  );
}
