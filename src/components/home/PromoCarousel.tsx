"use client";

import { useRef, useState, type ReactNode } from "react";
import { Dots } from "./Dots";

/**
 * Carousel ngang snap kiểu Home MSB: mỗi slide rộng ~86% (hé lộ card kế tiếp),
 * dot pagination đồng bộ vị trí cuộn. Nhận sẵn các slide (card ưu đãi tĩnh mock +
 * card insight thật) — không tự dựng nội dung. Cuộn nội bộ, không đụng window.
 */
export function PromoCarousel({ items }: { items: ReactNode[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const first = el.children[0] as HTMLElement | undefined;
    if (!first) return;
    const gap = 12;
    const step = first.offsetWidth + gap;
    setActive(Math.min(items.length - 1, Math.max(0, Math.round(el.scrollLeft / step))));
  }

  if (items.length === 0) return null;

  return (
    <div>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4"
        role="group"
        aria-label="Ưu đãi & gợi ý"
      >
        {items.map((item, i) => (
          <div key={i} className="w-[86%] shrink-0 snap-start">
            {item}
          </div>
        ))}
      </div>
      <Dots count={items.length} active={active} />
    </div>
  );
}
