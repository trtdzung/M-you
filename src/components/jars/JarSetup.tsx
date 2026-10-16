"use client";

import { Plus } from "lucide-react";
import { Card, SectionHeader, type Source } from "@/components/primitives";
import { Empty } from "@/components/states";
import { useJarConfig } from "@/state/jars";
import { useFinancials } from "@/state/useFinancials";
import { AllocationMeter } from "./AllocationMeter";
import { CategoryAssigner } from "./CategoryAssigner";
import { IncomeBasisControl } from "./IncomeBasisControl";
import { JarEditor } from "./JarEditor";
import { SurplusPanel } from "./SurplusPanel";

const PALETTE = ["bg-primary", "bg-source-msb", "bg-source-self", "bg-source-estimated", "bg-warning", "bg-positive"];

/**
 * Jar setup: income basis, live allocation meter, per-jar editors, and the
 * category→jar assignment grid. All writes go through `useJarConfig` and
 * auto-persist (no explicit save, matching the corrections UX). The resolved
 * income comes from the deterministic engine via `useFinancials` — the setup
 * screen never recomputes it.
 */
export function JarSetup() {
  const { config, addJar, updateJar, removeJar, assignCategory, setAllocation, setIncomeBasis, resetToSeed } =
    useJarConfig();
  const { financials } = useFinancials();

  const income: { value: number | "unknown"; source: Source } = financials?.jarIncomeBasis ?? {
    value: "unknown",
    source: "estimated",
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHeader title="Thu nhập tháng" subtitle="Cơ sở cho phân bổ theo phần trăm" />
        <Card>
          <IncomeBasisControl config={config} resolved={income} onSet={setIncomeBasis} />
        </Card>
      </section>

      <section>
        <SectionHeader title="Phân bổ" subtitle="Tổng các hũ so với thu nhập" />
        <AllocationMeter config={config} income={income} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Hũ chi tiêu" className="mb-0" />
        {config.jars.length === 0 ? (
          <Empty
            title="Chưa có hũ nào"
            description="Bắt đầu với mẫu gợi ý hoặc tạo hũ mới."
            action={
              <button
                type="button"
                onClick={resetToSeed}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-fg"
              >
                Dùng mẫu gợi ý
              </button>
            }
          />
        ) : (
          config.jars.map((jar, i) => (
            <JarEditor
              key={jar.id}
              jar={jar}
              accent={PALETTE[i % PALETTE.length]}
              onLabel={(label) => updateJar(jar.id, { label })}
              onAllocation={(allocation) => setAllocation(jar.id, allocation)}
              onDelete={() => removeJar(jar.id)}
            />
          ))
        )}
        <button
          type="button"
          onClick={() =>
            addJar({
              id: `jar-${Date.now()}`,
              label: "Hũ mới",
              categoryIds: [],
              allocation: { mode: "percent", value: 0 },
            })
          }
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-text"
        >
          <Plus size={16} /> Thêm hũ
        </button>
      </section>

      <section>
        <SectionHeader title="Phân loại hạng mục" subtitle="Mỗi hạng mục thuộc tối đa một hũ" />
        <Card>
          <CategoryAssigner config={config} onAssign={assignCategory} />
        </Card>
      </section>

      <section>
        <SectionHeader title="Thặng dư" subtitle="Mô phỏng phân bổ phần dư vào mục tiêu" />
        <SurplusPanel />
      </section>
    </div>
  );
}
