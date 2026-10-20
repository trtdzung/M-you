"use client";

import { Banknote, BadgeDollarSign, FileBadge, FileText, Star } from "lucide-react";
import type { ScreenProps } from "../../../model/screens";
import { paramString } from "../../../model/screens";
import { useNav } from "../../../store/PreviewStore";
import { BottomActions, ScreenHeader } from "../../shared";
import { card, emphasisTitle, primaryButton, screenPadding } from "../../shared/styles";

export function LoanAppHome({ params }: ScreenProps) {
  const nav = useNav();
  const goalId = paramString(params, "goalId");
  return (
    <div className={`${screenPadding} min-h-full`}>
      <ScreenHeader title="Vay" />
      <section className={`${card} flex flex-col items-center gap-6 py-6 text-center`}>
        <div aria-hidden className="relative flex h-32 w-32 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <FileText size={90} strokeWidth={1} />
          <BadgeDollarSign size={52} className="absolute bottom-0 right-0 text-warning" />
        </div>
        <h2 className={emphasisTitle}>Hạn mức thông minh<br />Linh hoạt tài chính</h2>
        <div className="grid w-full grid-cols-3 gap-3">
          {[{ Icon: Star, text: "Phù hợp nhu cầu" }, { Icon: Banknote, text: "Sử dụng chủ động" }, { Icon: BadgeDollarSign, text: "Quản lý dễ dàng" }].map(({ Icon, text }) => (
            <div key={text} className="flex flex-col items-center gap-3 text-sm font-semibold text-text"><Icon size={28} className="text-primary" /><span>{text}</span></div>
          ))}
        </div>
      </section>
      <section className={`${card} flex items-start gap-3`}>
        <FileBadge size={28} className="shrink-0 text-text" />
        <div className="flex flex-col gap-2">
          <h2 className="text-[16px] font-semibold text-text">Tại sao cần đăng ký hạn mức trước?</h2>
          <p className="text-sm leading-6 text-muted">Khách hàng cần đăng ký hạn mức vay trước để hệ thống đánh giá và xác định khả năng vay phù hợp. Sau khi hạn mức được phê duyệt, khách hàng có thể chủ động lựa chọn và đăng ký sản phẩm vay cụ thể trong phạm vi hạn mức đó. Mô hình này giúp quá trình vay nhanh hơn, minh bạch hơn và đảm bảo sản phẩm vay phù hợp với nhu cầu tài chính thực tế.</p>
        </div>
      </section>
      <div className="flex-1" />
      <BottomActions><button type="button" className={primaryButton} onClick={() => nav.push("LoanAppSurvey", { goalId })}>Đăng ký ngay</button></BottomActions>
    </div>
  );
}
