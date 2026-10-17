import { cn } from "@/lib/cn";

/**
 * 5 thanh cao thấp so le, nhịp lệch nhau (`animationDelay` khác nhau) — thay
 * cho dòng chữ tĩnh mỗi khi khung kết quả của Voice tab đang "làm gì đó": mở
 * mic, đang nghe, đang hoàn thiện câu chữ, đang chờ Agent. Lúc rảnh (khách không
 * giữ nút, Agent không phân tích) truyền `animated={false}`: các thanh đứng yên
 * ở chiều cao gốc. Thuần trang trí (`aria-hidden`) — trạng thái thật vẫn nằm ở
 * dòng `role="status"`/`"alert"` đi kèm, không đổi.
 *
 * `active` (đúng lúc đang GHI ÂM) đổi màu sang đỏ, khớp với vòng viền đỏ nhấp
 * nháy của nút mic lúc giữ — còn lại (mở mic/đang xử lý/rảnh) dùng màu cam
 * thương hiệu như mọi chỗ khác trong app.
 */
export function VoiceWaveform({ active = false, animated = true }: { active?: boolean; animated?: boolean }) {
  const bars = [
    { height: "h-3", duration: "0.9s", delay: "0s" },
    { height: "h-5", duration: "1.05s", delay: "0.15s" },
    { height: "h-8", duration: "0.85s", delay: "0.3s" },
    { height: "h-5", duration: "1.05s", delay: "0.15s" },
    { height: "h-3", duration: "0.9s", delay: "0s" },
  ] as const;

  return (
    <div aria-hidden className="flex items-end justify-center gap-1">
      {bars.map((bar, i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-full", animated && "voice-wave-bar", bar.height, active ? "bg-negative" : "bg-primary")}
          style={animated ? { animationDuration: bar.duration, animationDelay: bar.delay } : undefined}
        />
      ))}
    </div>
  );
}
