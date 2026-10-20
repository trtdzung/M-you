import Link from "next/link";
import { Sparkles } from "lucide-react";

type Suggestion = { label: string; points: number | null; cta: string };
type RecommendationProps =
  | { suggestions: Suggestion[]; onChoose: (choice: string) => void }
  | { suggestions: (Suggestion & { href: string })[]; onChoose?: undefined };

const DESCRIPTION: Record<string, string> = {
  "Bật mã": "Nhận ra tin nhắn, cuộc gọi thật từ MSB.",
  "Thêm người thân": "Báo người thân khi có dấu hiệu giao dịch đáng ngờ.",
  "Đổi mật khẩu": "Cập nhật mật khẩu để bảo vệ tài khoản của bạn.",
  "Bật bảo vệ": "Kiểm tra lệnh chuyển tiền, cảnh báo dấu hiệu lừa đảo.",
  "Thiết lập": "Thêm một lớp xác thực khi giao dịch.",
  "Thêm danh bạ": "Lưu người nhận quen thuộc để chuyển tiền an tâm hơn.",
};

/** Shared presentation for the Hub's next steps and the engine's Hub notice. */
export function SecurityRecommendations(props: RecommendationProps) {
  const { suggestions } = props;
  return <div className="shield-recommendations">
    <div className="shield-recommendations-heading">
      <span className="shield-recommendations-icon"><Sparkles size={18} aria-hidden /></span>
      <h2>M-You gợi ý cho bạn</h2>
      <span className="shield-recommendations-badge">Trợ lý AI</span>
    </div>
    <div className="shield-progress" role="region" aria-label="Các gợi ý tăng điểm bảo mật" tabIndex={0}>
      {suggestions.map((card, index) => <article key={card.cta} className="shield-progress-card">
        <div className="shield-progress-card-heading">
          <h3>{card.label}</h3>
          {card.points != null && <span aria-label={`Tăng ${card.points} điểm`}>+{card.points}</span>}
        </div>
        <p>{DESCRIPTION[card.cta]}</p>
        {props.onChoose
          ? <button type="button" aria-label={`${card.label}: Thiết lập ngay`} onClick={() => props.onChoose?.(card.cta)}>Thiết lập ngay</button>
          : <Link href={`/settings/${props.suggestions[index].href}`} aria-label={`${card.label}: Thiết lập ngay`}>Thiết lập ngay</Link>}
      </article>)}
    </div>
  </div>;
}
