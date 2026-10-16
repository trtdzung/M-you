import Link from "next/link";
import type { JarLine } from "@/domain/engine";
import { Empty } from "@/components/states";
import { JarCard } from "./JarCard";

/**
 * Renders the jar lines from the engine. Colour comes from position, not user
 * config (M9) — the "Chưa phân hũ" bucket is skipped in the palette so real jars
 * keep stable colours regardless of whether an unassigned bucket exists. Empty
 * config (user deleted every jar) offers a link to the setup route.
 */
const PALETTE = [
  "bg-primary",
  "bg-source-msb",
  "bg-source-self",
  "bg-source-estimated",
  "bg-warning",
  "bg-positive",
];

export function JarList({ lines, stale }: { lines: JarLine[]; stale: boolean }) {
  if (lines.length === 0) {
    return (
      <Empty
        title="Chưa có hũ chi tiêu"
        description="Tạo hũ để nhóm các hạng mục và theo dõi phân bổ."
        action={
          <Link href="/pfm/jars" className="text-sm font-medium text-primary underline">
            Thiết lập hũ
          </Link>
        }
      />
    );
  }

  let paletteIndex = 0;
  return (
    <ul className="flex flex-col gap-2.5">
      {lines.map((line) => (
        <li key={line.jarId}>
          <JarCard
            line={line}
            accent={line.isUnassigned ? "" : PALETTE[paletteIndex++ % PALETTE.length]}
            stale={stale}
          />
        </li>
      ))}
    </ul>
  );
}
