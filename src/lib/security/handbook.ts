// UC11 handbook. Rule copy for when the fraud agent is off. Wording matches the
// local library in personal-pfm-agent/data/fraud_playbook.json.

export type HandbookContext =
  | "new_customer" | "device_login" | "warned_account" | "warned_scan"
  | "hub_first" | "balance_up" | "after_incident";

export type HandbookArticle = {
  id: string;
  title: string;
  summary: [string, string, string];
  body: string;
};

export type GuideStep = { label: string; points: number; cta: string };

const ARTICLES: Record<string, HandbookArticle> = {
  common_scams: {
    id: "common_scams",
    title: "Thủ đoạn phổ biến",
    summary: [
      "Giả danh công an hoặc thuế thường ép bạn chuyển tiền gấp.",
      "Việc làm online trả hoa hồng nhỏ rồi đòi nộp thêm.",
      "Người lạ báo chuyển nhầm và nhờ chuyển sang tài khoản khác.",
    ],
    body: "Ba thủ đoạn này hay gặp với khách mới. Kẻ gian tạo áp lực để bạn tự chuyển tiền. Dừng lại, mở app MSB và nhờ tổng đài gọi lại khi có người hướng dẫn từ xa.",
  },
  msb_security: {
    id: "msb_security",
    title: "Giải pháp bảo mật MSB",
    summary: [
      "Bật mã chống giả mạo để nhận ra tin nhắn giả của MSB.",
      "Thêm người thân khẩn cấp để có người cùng kiểm tra giao dịch lạ.",
      "Kiểm tra thiết bị đăng nhập và đăng xuất thiết bị bạn không dùng.",
    ],
    body: "Ba việc này nằm trong Trung tâm bảo mật. Mã chống giả mạo hiện trên tin nhắn của MSB. Người thân khẩn cấp chỉ nhận cảnh báo, không xem số dư. Thiết bị lạ thì đăng xuất ngay.",
  },
  task_commission: {
    id: "task_commission",
    title: "Làm nhiệm vụ/hoa hồng",
    summary: [
      "Khoản nhỏ liên tiếp từ người lạ thường là mồi làm nhiệm vụ.",
      "Dừng chuỗi nộp thêm tiền theo yêu cầu.",
      "Giữ bằng chứng và yêu cầu MSB gọi lại.",
    ],
    body: "Hoa hồng nhỏ để lấy lòng, rồi đòi nộp thêm mới được rút. Dừng chuỗi đó. Giữ tin nhắn và nhờ MSB gọi lại, không chuyển theo lời người lạ.",
  },
  prize: {
    id: "prize",
    title: "Trúng thưởng",
    summary: [
      "Lời hứa thưởng hoặc hoàn tiền thường dẫn tới trang lạ.",
      "Dừng trả phí để nhận thưởng.",
      "Kiểm tra thông báo trong app, không theo link người lạ.",
    ],
    body: "MSB không yêu cầu phí để nhận thưởng qua tin nhắn lạ. Đối chiếu trong app. Không bấm đường dẫn và không nhập mã xác thực theo hướng dẫn trong tin đó.",
  },
};

const BY_CONTEXT: Record<HandbookContext, string> = {
  new_customer: "common_scams",
  device_login: "msb_security",
  warned_account: "task_commission",
  warned_scan: "prize",
  hub_first: "msb_security",
  balance_up: "msb_security",
  after_incident: "msb_security",
};

/** The article the rule shows for one context. Always three lines. */
export function ruleHandbook(context: HandbookContext): HandbookArticle {
  return ARTICLES[BY_CONTEXT[context]];
}

export function handbookArticle(id: string): HandbookArticle | null {
  return ARTICLES[id] ?? null;
}

export function handbookArticles(): HandbookArticle[] {
  return Object.values(ARTICLES);
}

/** Two fastest steps the server can see on the profile, when the Hub did not send its gauge. */
export function profileGuideSteps(profile: {
  antiPhishingCode: string | null;
  aiProtect: boolean;
  emergencyContacts: { status: string }[];
  trustedContacts: unknown[];
}): GuideStep[] {
  const steps: GuideStep[] = [];
  if (profile.antiPhishingCode === null) steps.push({ label: "Mã chống giả mạo", points: 15, cta: "Bật mã" });
  if (!profile.emergencyContacts.some(contact => contact.status === "active" || contact.status === "removing")) {
    steps.push({ label: "Người thân khẩn cấp", points: 15, cta: "Thêm người thân" });
  }
  if (!profile.aiProtect) steps.push({ label: "M-You bảo vệ bạn", points: 10, cta: "Bật bảo vệ" });
  if (profile.trustedContacts.length === 0) steps.push({ label: "Danh bạ tin cậy", points: 10, cta: "Thêm danh bạ" });
  return steps.slice(0, 2);
}
