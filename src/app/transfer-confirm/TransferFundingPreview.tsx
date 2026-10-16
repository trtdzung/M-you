"use client";

import { Card } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import type { FundingAssessment } from "@/domain/engine";

/**
 * RT-fix (H6): the anticipated auto-fund, reviewed BEFORE the user confirms.
 * H11/U16: when the amount exceeds CASA (or nothing — not even a goal jar — can
 * cover it) this is the plain "Số dư không đủ" state; a donor list is shown ONLY
 * when there are donors, never an empty "rót từ:" list.
 */
export function TransferFundingPreview({
  assessment,
  amount,
  casaBalance,
  poolSource,
}: {
  assessment: FundingAssessment;
  amount: number;
  casaBalance: number;
  /** The transfer draws on "Chưa phân bổ" (pool), not a jar. */
  poolSource: boolean;
}) {
  const overCasa = amount > casaBalance;
  if (
    overCasa ||
    (assessment.tier === "insufficient" && !assessment.requiresManualGoal)
  ) {
    return (
      <div role="alert" aria-label="Số dư không đủ">
        <Card className="bg-negative-soft">
          <p className="text-xs font-semibold text-negative">Số dư không đủ</p>
          <p className="mt-0.5 text-[11px] text-negative">
            {overCasa
              ? `Tài khoản chỉ còn ${formatVnd(casaBalance)} — hãy giảm số tiền.`
              : "Không hũ nào đủ tiền để bù số tiền này — hãy giảm số tiền."}
          </p>
        </Card>
      </div>
    );
  }
  const donors = [
    ...assessment.donors,
    ...(assessment.requiresManualGoal ? assessment.goalDonors : []),
  ];
  if (donors.length === 0) return null;
  const heading = assessment.requiresManualGoal
    ? "Chỉ còn hũ Mục tiêu để bù"
    : poolSource
      ? "Tiền chưa phân bổ không đủ — lấy thêm từ hũ"
      : "Sẽ tự bù cho hũ nguồn";
  return (
    <section aria-label="Dự kiến bù hũ">
      <Card className="bg-surface-tint">
        <p className="text-xs font-semibold text-text">{heading}</p>
        <p className="mt-0.5 text-[11px] text-muted">
          Thiếu {formatVnd(assessment.shortfall)} — rót từ:
        </p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {donors.map((d) => (
            <li
              key={d.jarId}
              className="flex items-center justify-between text-[13px] text-text"
            >
              <span className="truncate">{d.label}</span>
              <span className="tabular-nums font-medium">
                {formatVnd(d.take)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
