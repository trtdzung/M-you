import Link from "next/link";
import type { JarPartitionResult } from "@/domain/engine";
import { Empty, InsufficientData } from "@/components/states";
import { AllocationMeter } from "./AllocationMeter";
import { JarCard } from "./JarCard";

/**
 * Read-only view of the balance partition (Model A): a composition meter, then a
 * card per explicit jar. Colour comes from position, not user config. The
 * partition reflects the CURRENT balance in real time — only the per-jar "đã
 * tiêu" overlay follows the selected month (`periodLabel`), which the note makes
 * explicit (red-team #8). Unknown primary balance → an insufficient-data state,
 * never fabricated lines. Empty config → a setup CTA.
 */
const PALETTE = [
  "bg-primary",
  "bg-source-msb",
  "bg-source-self",
  "bg-source-estimated",
  "bg-warning",
  "bg-positive",
];

export function JarList({
  partition,
  periodLabel,
}: {
  partition: JarPartitionResult;
  periodLabel?: string;
}) {
  if (partition.status !== "ok") {
    return (
      <InsufficientData description="Không xác định được tài khoản chính (cần đúng một tài khoản thanh toán) nên chưa thể chia hũ." />
    );
  }

  const explicit = partition.lines.filter((l) => !l.isResidual);

  if (explicit.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <AllocationMeter partition={partition} />
        <Empty
          title="Chưa có hũ chi tiêu"
          description="Tạo hũ để chia số dư và theo dõi chi tiêu theo hạng mục."
          action={
            <Link href="/pfm/jars" className="text-sm font-medium text-primary underline">
              Thiết lập hũ
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AllocationMeter partition={partition} />
      <p className="text-xs text-muted">
        Phần chia theo số dư hiện tại{periodLabel ? ` · “đã tiêu” tính trong ${periodLabel}` : ""}.
      </p>
      <ul className="flex flex-col gap-2.5">
        {explicit.map((line, i) => (
          <li key={line.jarId}>
            <JarCard line={line} accent={PALETTE[i % PALETTE.length]} />
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted">
        Hũ chỉ để bạn nhìn tiền rõ hơn — tiền vẫn nằm nguyên trong tài khoản của bạn.
      </p>
    </div>
  );
}
