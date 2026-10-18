// Scam Shield scenario matrix, copied VERBATIM from the "AI Agent Fraud" spec,
// section 3 (notes/scam-shield/SPEC-fraud.md). Markdown bold is dropped from the
// text and kept in `emphasis`. Do not reword: change the spec copy first, then
// this table. Two rows are additions the level table needs but the matrix has
// no code for (`derived` says so): DH3-2 (T1 + T6, 2nd order) and DH-T5.

export type ScenarioId =
  | "BT1" | "BT2" | "BT3" | "BT4" | "BT5" | "BT6" | "BT7"
  | "DH1" | "DH2" | "DH3" | "DH3-2" | "DH4" | "DH5" | "DH6" | "DH7" | "DH8" | "DH-T5"
  | "SC1" | "SC2" | "SC3" | "SC4"
  | "EDU" | "HUB";

export type Surface = "tooltip" | "banner" | "popup" | "fullscreen" | "chat" | "form";
export type ScenarioLevel = "green" | "yellow" | "red";

export type ScenarioCopy = {
  id: ScenarioId;
  level: ScenarioLevel;
  /** Spec columns, verbatim. DH7 and DH8 leave "Màn" empty in the spec; both show on Xác nhận CT. */
  situation: string;
  trigger: string;
  screen: string;
  display: string;
  frequency: string;
  /** Spec "Nội dung", verbatim (bold dropped). `{…}` marks a value filled at run time. */
  content: string;
  /** `content` split for the UI: the statement, and the one question when there is one. */
  message: string;
  question: string | null;
  emphasis: string[];
  /** Spec "Chip", verbatim, in order. */
  chips: string[];
  /** Red: "Câu hỏi phân loại" is part of the popup. */
  classify: boolean;
  surface: Surface;
  countdownSec: number | null;
  /** Set when the row is not in the matrix itself. */
  derived?: string;
};

/** UC 12 diagnostic questions ("Câu hỏi phân loại" until the agent asks its own). */
export const CLASSIFY_QUESTIONS = [
  "Có ai đang gọi điện hướng dẫn anh/chị không?",
  "Người đó có dặn đừng nói với người thân không?",
] as const;

/** DH8: "…và <context>" — one part per kind of T8, spec wording. */
export const DH8_CONTEXT = {
  night: "giao dịch diễn ra lúc nửa đêm",
  words: (words: string[]) => `nội dung có từ ${words.map(w => `'${w}'`).join(", ")}`,
  screenSharing: "có ứng dụng đang chia sẻ màn hình",
} as const;

const RED_CHIPS = ["Để MSB gọi lại"];

export const SCENARIO_COPY: Record<ScenarioId, ScenarioCopy> = {
  // GĐ1: Bình thường (Mức xanh)
  BT1: {
    id: "BT1", level: "green", situation: "KH mới làm quen", trigger: "Trong 7 ngày đầu, lần đầu mở màn chuyển tiền",
    screen: "Màn home -> Insight", display: "Tooltip · nút Chuyển tiền", frequency: "1 lần duy nhất",
    content: "Bạn đã biết những phương thức bảo mật của MSB chưa?",
    message: "", question: "Bạn đã biết những phương thức bảo mật của MSB chưa?", emphasis: [],
    chips: ["Xem 3 thủ đoạn phổ biến", "Trung tâm bảo mật"], classify: false, surface: "tooltip", countdownSec: null,
  },
  BT2: {
    id: "BT2", level: "green", situation: "Điểm bảo mật thấp", trigger: "Điểm dưới mức Cao, khi KH mở Hub Security",
    screen: "Security hub", display: "Tooltip · đồng hồ cấp độ bảo mật", frequency: "Tối đa 1 lần/tháng",
    content: "Điểm bảo mật: {score}/100. Bật mã chống giả mạo (+15) và thêm người thân khẩn cấp (+10) để lên mức Cao.",
    message: "Điểm bảo mật: {score}/100. Bật mã chống giả mạo (+15) và thêm người thân khẩn cấp (+10) để lên mức Cao.", question: null, emphasis: [],
    chips: ["Bật mã", "Thêm người thân"], classify: false, surface: "tooltip", countdownSec: null,
  },
  BT3: {
    id: "BT3", level: "green", situation: "Số dư tăng mạnh", trigger: "Nhận từ 50 triệu (lương, thưởng, sổ đáo hạn) và chưa có người thân khẩn cấp",
    screen: "- Home - Lịch sử chuyển tiền - Security hub", display: "Tooltip · cạnh số dư ở Home, lần mở app kế tiếp", frequency: "Tối đa 1 lần/tháng",
    content: "Khoản {amount} vừa về. Thêm người thân khẩn cấp để luôn có người cùng bạn kiểm tra khi có giao dịch bất thường.",
    message: "Khoản {amount} vừa về. Thêm người thân khẩn cấp để luôn có người cùng bạn kiểm tra khi có giao dịch bất thường.", question: null, emphasis: [],
    chips: ["Thêm người thân", "Tự khóa chuyển tiền", "Để sau"], classify: false, surface: "tooltip", countdownSec: null,
  },
  BT4: {
    id: "BT4", level: "green", situation: "Nhận 3 khoản nhỏ liên tiếp từ cùng 1 người lạ", trigger: "T7a",
    screen: "- Home insight - Lịch sử chuyển tiền - Security hub", display: "Tooltip · trên giao dịch nhận tiền (lịch sử, chi tiết giao dịch)", frequency: "1 lần/7 ngày",
    content: "Bạn vừa nhận {amount} từ tài khoản lạ. Nếu đây là 'hoa hồng làm nhiệm vụ', đó thường là bước mồi của lừa đảo.",
    message: "Bạn vừa nhận {amount} từ tài khoản lạ. Nếu đây là 'hoa hồng làm nhiệm vụ', đó thường là bước mồi của lừa đảo.", question: null, emphasis: [],
    chips: ["Xem thủ đoạn", "Tôi biết người này"], classify: false, surface: "tooltip", countdownSec: null,
  },
  BT5: {
    id: "BT5", level: "green", situation: "Nhận khoản lớn từ người lạ", trigger: "T7b",
    screen: "- Home insight - Lịch sử chuyển tiền - Security hub", display: "Tooltip · trên giao dịch nhận tiền", frequency: "Mỗi lần",
    content: "Bạn vừa nhận {amount} từ tài khoản lạ. Nếu có người báo chuyển nhầm và nhờ chuyển trả vào tài khoản khác, đừng làm. MSB sẽ tra soát và hoàn trả về đúng tài khoản gốc.",
    message: "Bạn vừa nhận {amount} từ tài khoản lạ. Nếu có người báo chuyển nhầm và nhờ chuyển trả vào tài khoản khác, đừng làm. MSB sẽ tra soát và hoàn trả về đúng tài khoản gốc.", question: null,
    emphasis: ["tài khoản khác"], chips: ["Yêu cầu MSB tra soát", "Tôi biết khoản này"], classify: false, surface: "tooltip", countdownSec: null,
  },
  BT6: {
    id: "BT6", level: "green", situation: "Chuyển cho 1 người nhiều lần", trigger: "Chuyển cho cùng một người lần thứ 2 trong 5 phút",
    screen: "- Xác nhận chuyển tiền", display: "Tooltip · màn chuyển tiền thành công", frequency: "1 lần mỗi người nhận",
    content: "Lưu người này vào danh bạ tin cậy. Lần sau nếu có tài khoản giả danh họ, M-You sẽ nhận ra.",
    message: "Lưu người này vào danh bạ tin cậy. Lần sau nếu có tài khoản giả danh họ, M-You sẽ nhận ra.", question: null, emphasis: [],
    chips: ["Lưu vào danh bạ tin cậy", "Bỏ qua"], classify: false, surface: "tooltip", countdownSec: null,
  },
  BT7: {
    id: "BT7", level: "green", situation: "KH nghi ngờ tin nhắn, link, SĐT lạ", trigger: "KH tự dán vào công cụ quét",
    screen: "- Security hub", display: "Chat M-You (LLM phân tích)", frequency: "Khi KH dùng",
    content: "Tin nhắn nhắc 'chương trình hoàn tiền 2 triệu của MSB', nhưng MSB không có chương trình này. Link dẫn tới tên miền lạ. Kết luận: Nguy hiểm.",
    message: "Tin nhắn nhắc 'chương trình hoàn tiền 2 triệu của MSB', nhưng MSB không có chương trình này. Link dẫn tới tên miền lạ. Kết luận: Nguy hiểm.", question: null,
    emphasis: ["Nguy hiểm"], chips: ["Báo cáo", "Xem thủ đoạn tương tự"], classify: false, surface: "chat", countdownSec: null,
  },

  // GĐ2: Phát hiện dấu hiệu lạ
  DH1: {
    id: "DH1", level: "yellow", situation: "Giả danh người quen", trigger: "T1b",
    screen: "- Xác nhận CT", display: "Banner Vàng", frequency: "Không lặp với cùng người nhận đã xác nhận trong 30 ngày",
    content: "Tên giống người bạn từng chuyển, nhưng số tài khoản khác. Bạn đã gọi điện xác nhận chưa?",
    message: "Tên giống người bạn từng chuyển, nhưng số tài khoản khác.", question: "Bạn đã gọi điện xác nhận chưa?",
    emphasis: ["số tài khoản khác"], chips: ["Đã gọi, tiếp tục", "Để tôi gọi"], classify: false, surface: "banner", countdownSec: null,
  },
  DH2: {
    id: "DH2", level: "yellow", situation: "Chuyển số tiền lớn cho người lạ", trigger: "T1 + T3",
    screen: "- Xác nhận CT", display: "Banner Vàng", frequency: "Mỗi lần",
    content: "Bạn đang chuyển số tiền lớn hơn thường lệ cho người nhận mới. Bạn đã kiểm tra kỹ người nhận chưa?",
    message: "Bạn đang chuyển số tiền lớn hơn thường lệ cho người nhận mới.", question: "Bạn đã kiểm tra kỹ người nhận chưa?",
    emphasis: [], chips: ["Đã kiểm tra, tiếp tục", "Kiểm tra lại"], classify: false, surface: "banner", countdownSec: null,
  },
  DH3: {
    id: "DH3", level: "yellow", situation: "Chuyển nhiều lần tăng dần", trigger: "T1 + T6 (lệnh thứ 3)",
    screen: "- Xác nhận CT", display: "Banner Vàng", frequency: "Theo chuỗi lệnh",
    content: "Đây là lần thứ 3 bạn chuyển cho cùng người này trong 10 phút, số tiền tăng dần. Ai đang yêu cầu bạn chuyển thêm?",
    message: "Đây là lần thứ 3 bạn chuyển cho cùng người này trong 10 phút, số tiền tăng dần.", question: "Ai đang yêu cầu bạn chuyển thêm?",
    emphasis: [], chips: ["Tôi tự chuyển", "Có người yêu cầu → xem thêm"], classify: false, surface: "banner", countdownSec: null,
  },
  "DH3-2": {
    id: "DH3-2", level: "yellow", situation: "Chuyển nhiều lần tăng dần", trigger: "T1 + T6 (lệnh thứ 2)",
    screen: "- Xác nhận CT", display: "Banner Vàng", frequency: "Theo chuỗi lệnh",
    content: "Đây là lần thứ 2 bạn chuyển cho cùng người này trong 10 phút, số tiền tăng dần. Ai đang yêu cầu bạn chuyển thêm?",
    message: "Đây là lần thứ 2 bạn chuyển cho cùng người này trong 10 phút, số tiền tăng dần.", question: "Ai đang yêu cầu bạn chuyển thêm?",
    emphasis: [], chips: ["Tôi tự chuyển", "Có người yêu cầu → xem thêm"], classify: false, surface: "banner", countdownSec: null,
    derived: "Bảng mức (mục 2): Vàng «T1 + T6 (lệnh thứ 2)»; câu DH3 với «lần thứ 2» (PLAN Q2)",
  },
  DH4: {
    id: "DH4", level: "red", situation: "Chuyển tới tài khoản bị cảnh báo", trigger: "T2",
    screen: "- Input TT người thụ hưởng - Xác nhận CT", display: "Popup Đỏ", frequency: "Mọi lần",
    // The cell's second sentence is an instruction for the agent, not copy to show.
    content: "\"Tài khoản này nằm trong danh sách cảnh báo lừa đảo.\" Nếu hệ thống lõi tạm dừng theo quy định, agent giải thích lý do",
    message: "Tài khoản này nằm trong danh sách cảnh báo lừa đảo.", question: null,
    emphasis: ["danh sách cảnh báo lừa đảo"], chips: RED_CHIPS, classify: true, surface: "popup", countdownSec: 60,
  },
  DH5: {
    id: "DH5", level: "red", situation: "Rút cạn tiết kiệm rồi chuyển", trigger: "T1 + T4",
    screen: "- Màn rút FD", display: "Popup Đỏ · đếm ngược 60 giây · push người thân", frequency: "Mọi lần",
    content: "Bạn vừa tất toán sổ {amount} và đang chuyển cho người nhận mới. Hầu hết các vụ lừa lớn đều đi qua bước này.",
    message: "Bạn vừa tất toán sổ {amount} và đang chuyển cho người nhận mới. Hầu hết các vụ lừa lớn đều đi qua bước này.", question: null,
    emphasis: [], chips: RED_CHIPS, classify: true, surface: "popup", countdownSec: 60,
  },
  DH6: {
    id: "DH6", level: "red", situation: "Lừa làm nhiệm vụ / đầu tư", trigger: "T1 + T6 + T7a (lệnh thứ 3)",
    screen: "- Xác nhận CT", display: "Popup Đỏ · đếm ngược 60 giây", frequency: "Mọi lần",
    content: "Bạn đã nhận một khoản nhỏ từ người lạ, và đang chuyển lần thứ 3 với số tiền tăng dần. Đây là cách lừa đảo 'làm nhiệm vụ' vẫn vận hành.",
    message: "Bạn đã nhận một khoản nhỏ từ người lạ, và đang chuyển lần thứ 3 với số tiền tăng dần. Đây là cách lừa đảo 'làm nhiệm vụ' vẫn vận hành.", question: null,
    emphasis: [], chips: RED_CHIPS, classify: true, surface: "popup", countdownSec: 60,
  },
  DH7: {
    id: "DH7", level: "red", situation: "Chuyển nhầm / chuyển tiền hộ", trigger: "T1 + T7b (chuyển ra từ 80% số vừa nhận trong 24h)",
    screen: "", display: "Popup Đỏ · đếm ngược 60 giây", frequency: "Mọi lần",
    content: "Bạn đang chuyển đi gần hết khoản vừa nhận từ tài khoản lạ, sang một tài khoản khác. Chuyển trả sai cách hoặc chuyển tiền hộ có thể khiến tài khoản của bạn bị liên đới.",
    message: "Bạn đang chuyển đi gần hết khoản vừa nhận từ tài khoản lạ, sang một tài khoản khác. Chuyển trả sai cách hoặc chuyển tiền hộ có thể khiến tài khoản của bạn bị liên đới.", question: null,
    emphasis: [], chips: ["Yêu cầu MSB tra soát", "Để MSB gọi lại"], classify: true, surface: "popup", countdownSec: 60,
  },
  DH8: {
    id: "DH8", level: "red", situation: "Dấu hiệu Vàng kèm ngữ cảnh rủi ro", trigger: "DH1, DH2 hoặc DH3 + T8",
    screen: "", display: "Popup Đỏ · đếm ngược 30 giây", frequency: "Mọi lần",
    content: "Dòng đầu giữ như kịch bản Vàng tương ứng, thêm: \"…và giao dịch diễn ra lúc nửa đêm / nội dung có từ 'thuế', 'tài khoản an toàn' / có ứng dụng đang chia sẻ màn hình.\"",
    message: "{base} …và {context}.", question: null,
    emphasis: [], chips: RED_CHIPS, classify: true, surface: "popup", countdownSec: 30,
  },
  "DH-T5": {
    id: "DH-T5", level: "red", situation: "Tài khoản vừa thay đổi rồi chuyển số tiền lớn", trigger: "T1 + T5 + T3",
    screen: "- Xác nhận CT", display: "Popup Đỏ · đếm ngược 60 giây", frequency: "Mọi lần",
    content: "Tài khoản của bạn vừa có thay đổi ({change}) và bạn đang chuyển số tiền lớn cho người nhận mới. Hầu hết các vụ lừa lớn đều đi qua bước này.",
    message: "Tài khoản của bạn vừa có thay đổi ({change}) và bạn đang chuyển số tiền lớn cho người nhận mới. Hầu hết các vụ lừa lớn đều đi qua bước này.", question: null,
    emphasis: [], chips: RED_CHIPS, classify: true, surface: "popup", countdownSec: 60,
    derived: "Bảng mức (mục 2) có Đỏ «T1 + T5 + T3» nhưng ma trận không có mã; câu theo khung DH5 (PLAN Q1)",
  },

  // GĐ3: Sau sự cố
  SC1: {
    id: "SC1", level: "red", situation: "Khóa khẩn cấp",
    trigger: "KH bấm [Tôi nghĩ mình bị lừa] (popup, Hub Security, chat), [Không phải tôi → khóa ngay] (BT4, DH6), hoặc AI phát hiện trong chat (\"có người bảo tôi chuyển tiền giữ hộ\")",
    screen: "- Security hub - Chat vs M-You", display: "Toàn màn hình + app push tới người thân khẩn cấp", frequency: "Mỗi lần kích hoạt",
    content: "Bình tĩnh, M-You ở đây. Làm ngay 3 bước: ① khóa tạm tài khoản và thẻ, ② đánh dấu giao dịch đáng ngờ, ③ nói chuyện với tổng đài viên ưu tiên.",
    message: "Bình tĩnh, M-You ở đây. Làm ngay 3 bước: ① khóa tạm tài khoản và thẻ, ② đánh dấu giao dịch đáng ngờ, ③ nói chuyện với tổng đài viên ưu tiên.", question: null,
    emphasis: [], chips: ["Khóa ngay", "Đánh dấu giao dịch", "Gọi tổng đài ưu tiên"], classify: false, surface: "fullscreen", countdownSec: null,
  },
  SC2: {
    id: "SC2", level: "red", situation: "Lập hồ sơ tra soát", trigger: "Ngay sau SC1",
    screen: "- Tra soát - Chat với M-You", display: "Chat M-You (LLM hỏi từng câu)", frequency: "1 lần mỗi sự cố",
    content: "AI hỏi lần lượt: thời gian, số tiền, tài khoản và ngân hàng nhận, kẻ gian liên lạc qua kênh nào, ảnh chụp tin nhắn → hồ sơ đề nghị phối hợp liên ngân hàng theo QĐ 71. Cuối cùng hướng dẫn trình báo cơ quan công an",
    message: "AI hỏi lần lượt: thời gian, số tiền, tài khoản và ngân hàng nhận, kẻ gian liên lạc qua kênh nào, ảnh chụp tin nhắn → hồ sơ đề nghị phối hợp liên ngân hàng theo QĐ 71. Cuối cùng hướng dẫn trình báo cơ quan công an", question: null,
    emphasis: [], chips: ["Gửi hồ sơ", "Tải ảnh", "Bổ sung sau"], classify: false, surface: "form", countdownSec: null,
  },
  SC3: {
    id: "SC3", level: "red", situation: "Theo dõi hồ sơ, phòng bị lừa lần 2", trigger: "30 ngày sau sự cố",
    screen: "- Tra soát - Chat với M-You", display: "Banner cố định trên thẻ hồ sơ ở Home · app push khi hồ sơ có cập nhật", frequency: "Banner suốt 30 ngày · push theo cập nhật",
    content: "Hồ sơ của bạn đang được xử lý. Lưu ý: bất kỳ ai đề nghị 'hỗ trợ lấy lại tiền' có thu phí đều là lừa đảo. MSB chỉ cập nhật hồ sơ trong app này.",
    message: "Hồ sơ của bạn đang được xử lý. Lưu ý: bất kỳ ai đề nghị 'hỗ trợ lấy lại tiền' có thu phí đều là lừa đảo. MSB chỉ cập nhật hồ sơ trong app này.", question: null,
    emphasis: [], chips: ["Xem trạng thái hồ sơ"], classify: false, surface: "banner", countdownSec: null,
  },
  SC4: {
    id: "SC4", level: "red", situation: "Phục hồi bảo mật", trigger: "Sau SC1",
    screen: "- Security hub", display: "Tooltip · Hub Security, hiện đến khi hoàn tất", frequency: "Đến khi xong",
    content: "Checklist: ① đổi mật khẩu → ② đăng xuất mọi thiết bị lạ → ③ bật mã chống giả mạo → ④ thêm người thân khẩn cấp. Điểm bảo mật tăng sau mỗi bước",
    message: "Checklist: ① đổi mật khẩu → ② đăng xuất mọi thiết bị lạ → ③ bật mã chống giả mạo → ④ thêm người thân khẩn cấp. Điểm bảo mật tăng sau mỗi bước", question: null,
    emphasis: [],     chips: ["Làm bước tiếp theo"], classify: false, surface: "tooltip", countdownSec: null,
  },
  // UC11 handbook. The three lines come from the library at run time.
  EDU: {
    id: "EDU", level: "green", situation: "Cẩm nang theo ngữ cảnh",
    trigger: "KH mới trong 7 ngày đầu, đăng nhập thiết bị mới, hoặc vừa giao dịch với tài khoản nghi ngờ",
    screen: "Mọi màn", display: "Tooltip · tóm tắt 3 dòng", frequency: "Tối đa 1 lần/tuần, trừ trường hợp khẩn cấp",
    content: "Hiện bản tóm tắt 3 dòng kèm link bài đầy đủ.",
    message: "Hiện bản tóm tắt 3 dòng kèm link bài đầy đủ.", question: null, emphasis: [],
    chips: ["Link bài đầy đủ"], classify: false, surface: "tooltip", countdownSec: null,
    derived: "UC11 cẩm nang theo ngữ cảnh",
  },
  // UC11 hub coach. The two steps and the score are filled from the gauge.
  HUB: {
    id: "HUB", level: "green", situation: "Hướng dẫn dùng Hub Security",
    trigger: "Lần đầu dùng, số dư tăng lớn, sau một sự cố",
    screen: "Security hub", display: "Tooltip · đồng hồ cấp độ bảo mật", frequency: "Mỗi lần kích hoạt",
    content: "Gợi ý 2 việc tăng điểm nhanh nhất, kèm chip bật ngay.",
    message: "Gợi ý 2 việc tăng điểm nhanh nhất, kèm chip bật ngay.", question: null, emphasis: [],
    chips: ["Bật mã", "Thêm người thân"], classify: false, surface: "tooltip", countdownSec: null,
    derived: "UC11 hướng dẫn Hub",
  },
};

/** Quick diagnostic answers required by A05. */
export const DIAGNOSE_ANSWERS = ["Có", "Không", "Không chắc"] as const;

export const DIAGNOSE_PROPOSALS = { callback: SCENARIO_COPY.DH4.chips[0], emergency_lock: "Tôi nghĩ mình bị lừa", case: SCENARIO_COPY.DH7.chips[0] } as const;
