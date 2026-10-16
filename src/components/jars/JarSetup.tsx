"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, SectionHeader } from "@/components/primitives";
import { Empty } from "@/components/states";
import { JAR_TEMPLATE_LIST, type JarTemplate } from "@/domain/models/jar-defaults";
import { useJarConfig } from "@/state/jars";
import { useFinancials } from "@/state/useFinancials";
import { AllocationMeter } from "./AllocationMeter";
import { CategoryAssigner } from "./CategoryAssigner";
import { JarEditor } from "./JarEditor";
import { SurplusPanel } from "./SurplusPanel";
import { cn } from "@/lib/cn";

const PALETTE = ["bg-primary", "bg-source-msb", "bg-source-self", "bg-source-estimated", "bg-warning", "bg-positive"];

/**
 * Jar setup (Model A): pick a template, tune each jar's share of the current
 * balance, and assign categories. The live meter (from the deterministic engine
 * via `useFinancials`) reconciles the partition to the balance as you edit and
 * flags over-allocation. All writes auto-persist through `useJarConfig`. No
 * income basis, no anchor, no money movement.
 */
export function JarSetup() {
  const { config, addJar, updateJar, removeJar, assignCategory, setAllocation, applyTemplate } = useJarConfig();
  const { financials } = useFinancials();
  const [pending, setPending] = useState<JarTemplate["id"] | null>(null);

  function chooseTemplate(id: JarTemplate["id"]) {
    if (config.jars.length === 0) {
      applyTemplate(id);
      return;
    }
    setPending(id); // confirm before replacing an existing set
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHeader title="Mẫu hũ" subtitle="Chọn mẫu phù hợp — sẽ thay toàn bộ hũ hiện tại" />
        <div className="grid grid-cols-3 gap-2">
          {JAR_TEMPLATE_LIST.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => chooseTemplate(t.id)}
              className="rounded-2xl border border-border bg-surface p-3 text-left"
            >
              <span className="block text-sm font-semibold text-text">{t.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{t.description}</span>
            </button>
          ))}
        </div>
        {pending && (
          <div className="mt-2 flex items-center justify-between rounded-2xl bg-warning-soft/60 p-3 text-sm">
            <span className="text-text">Thay toàn bộ hũ hiện tại bằng mẫu này?</span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  applyTemplate(pending);
                  setPending(null);
                }}
                className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-fg"
              >
                Thay
              </button>
              <button type="button" onClick={() => setPending(null)} className="rounded-full px-3 py-1 text-xs font-medium text-muted">
                Hủy
              </button>
            </span>
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Phân chia số dư" subtitle="Tổng các hũ so với số dư hiện tại" />
        {financials ? (
          <AllocationMeter partition={financials.jarPartition} />
        ) : (
          <div className="rounded-2xl bg-surface-muted/40 p-3 text-sm text-muted">Đang tải số dư…</div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Hũ chi tiêu" className="mb-0" />
        {config.jars.length === 0 ? (
          <Empty title="Chưa có hũ nào" description="Chọn một mẫu ở trên hoặc tạo hũ mới." />
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
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-text",
          )}
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
        <SectionHeader title="Thặng dư" subtitle="Mô phỏng phân bổ phần chưa phân bổ vào mục tiêu" />
        <SurplusPanel />
      </section>
    </div>
  );
}
