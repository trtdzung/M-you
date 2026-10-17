// All user-facing text of the goals feature (Vietnamese).
import type { GoalFlexibility, GoalProgressState, GoalStatus } from "../model/types";

export const GOALS_COPY = {
  title: "Mục tiêu",
  emptyTitle: "Chưa có mục tiêu nào",
  emptyDescription: "Tạo mục tiêu đầu tiên để bắt đầu tích lũy.",
  loadError: "Không tải được dữ liệu. Vui lòng thử lại.",
  actionError: "Không thực hiện được. Vui lòng thử lại.",
  retry: "Thử lại",
  back: "Quay lại",

  create: "Tạo mục tiêu",
  seedDemo: "Thêm mục tiêu mẫu",
  edit: "Sửa mục tiêu",
  save: "Lưu",
  saving: "Đang lưu…",
  cancel: "Hủy",
  archivedGroup: "Đã lưu trữ",
  listMonthly: (amount: string) => `Góp ${amount}/tháng`,
  notFoundTitle: "Không tìm thấy mục tiêu",
  notFoundDescription: "Mục tiêu này không tồn tại hoặc đã bị xóa.",
  backToList: "Về danh sách mục tiêu",

  coach: {
    title: "Nói mục tiêu của bạn",
    placeholder: "Ví dụ: mua xe trong 3 năm",
    inputLabel: "Mục tiêu bạn muốn đạt",
    send: "Gửi",
    thinking: "Đang tìm hiểu mục tiêu của bạn…",
    freeTextPlaceholder: "Hoặc nhập câu trả lời khác",
    answerLabel: "Câu trả lời của bạn",
    restart: "Bắt đầu lại",
    draftReady: "Mình đã điền sẵn mục tiêu, bạn kiểm tra rồi bấm Lưu nhé.",
    notAGoal: "Mình chỉ giúp đặt mục tiêu tiết kiệm. Bạn thử nói mục tiêu như “mua xe 600 triệu trong 3 năm” nhé.",
    unavailable: "Mình chưa hiểu được lúc này. Bạn có thể tự nhập mục tiêu.",
    manual: "Tự nhập",
    yourSentence: (text: string) => `Bạn đã nói: “${text}”`,
    reviewAndCreate: "Kiểm tra và tạo mục tiêu",
  },

  advisor: {
    stepsLabel: "Các bước phân tích",
    step1: "Hiểu mục tiêu của bạn",
    step2: "Đối chiếu dòng tiền của bạn",
    step3: "Kết luận",
    calculating: "Đang tính…",
    unknownValue: "Chưa rõ",
    plans: {
      title: "Chọn cách thực hiện",
      recommended: "Gợi ý",
      keep_deadline: "Giữ hạn",
      extend_deadline: "Lùi hạn",
      reduce_amount: "Giảm số tiền",
      unavailable: {
        fixed_goal: "Mục tiêu đặt là phải đúng hạn nên không lùi hạn.",
        no_surplus: "Chưa có phần dư để áp dụng cách này.",
        unknown_surplus: "Chưa đủ dữ liệu để áp dụng cách này.",
        already_enough: "Số đã có đã vượt mức đạt được.",
      },
      fundingIdle: (amount: string) => `Dùng trước ${amount} từ tiền tiết kiệm đang dư`,
      fundingJar: (label: string, amount: string) => `Lấy ${amount} từ hũ ${label}`,
      gapNotCovered: "Các khoản cắt trên vẫn chưa đủ, cần kết hợp thêm.",
      selected: "Đang chọn",
      select: "Chọn cách này",
    },
    chart: { title: "Dự kiến tích lũy", label: (name: string) => `Đồ thị tích lũy theo ${name}`, target: "Mục tiêu" },
    sliders: {
      title: "Thử điều chỉnh",
      months: "Thời gian",
      amount: "Số tiền mục tiêu",
      monthsValue: (n: number) => `${n} tháng`,
      reset: "Về mục tiêu ban đầu",
      recalculating: "Đang tính lại…",
      failed: "Chưa tính lại được, bạn thử lại sau.",
    },
    sourceMock: (months: number) => `Dữ liệu mô phỏng, ${months} tháng`,
    verdict: {
      feasible: "Khả thi",
      stretch: "Khả thi nhưng khá sát",
      not_feasible: "Cần điều chỉnh",
      unknown: "Chưa đủ dữ liệu",
    },
  },

  form: {
    name: "Tên mục tiêu",
    namePlaceholder: "Ví dụ: Mua nhà",
    targetAmount: "Số tiền mục tiêu",
    targetDate: "Ngày hoàn thành",
    flexibility: "Loại mục tiêu",
    openingAmount: "Số đã có sẵn",
    openingHint: "Được ghi như lần góp đầu tiên.",
    monthlyContribution: "Góp dự định mỗi tháng",
    monthlyHint: "Để trống nếu chưa đặt.",
    surplus: "Phần dư ước tính mỗi tháng",
    surplusHint: "Chưa đủ dữ liệu giao dịch để tính. Nhập ước tính của bạn.",
  },

  flexibility: { fixed: "Hạn cố định", flexible: "Có thể lùi" } satisfies Record<GoalFlexibility, string>,
  status: {
    active: "Đang chạy",
    paused: "Tạm dừng",
    archived: "Đã lưu trữ",
  } satisfies Record<GoalStatus, string>,
  progressState: {
    on_track: "Đúng tiến độ",
    ahead: "Vượt tiến độ",
    slightly_behind: "Chậm nhẹ",
    off_track: "Lệch rõ",
  } satisfies Record<GoalProgressState, string>,

  actions: {
    contribute: "Góp",
    withdraw: "Rút",
    edit: "Sửa",
    pause: "Tạm dừng",
    resume: "Tiếp tục",
    archive: "Lưu trữ",
    delete: "Xóa",
  },

  detail: {
    progress: "Tiến độ",
    deadline: "Hạn",
    requiredMonthly: "Cần góp mỗi tháng",
    status: "Trạng thái",
    history: "Lịch sử góp/rút",
    historyEmpty: "Chưa có giao dịch nào",
    deposit: "Góp",
    withdraw: "Rút",
  },

  feasibility: {
    title: "Khả năng đạt mục tiêu",
    calculating: "Đang tính khả năng đạt mục tiêu…",
    met: "Bạn đã đạt mục tiêu này.",
    feasible: "Khả thi với phần dư hiện tại.",
    infeasible: "Chưa khả thi với phần dư hiện tại.",
    required: "Cần góp",
    surplus: "Phần dư",
    perMonth: "/tháng",
    levers: "Gợi ý điều chỉnh",
    extendDate: (date: string) => `Lùi hạn đến ${date}`,
    reduceAmount: (amount: string) => `Giảm mục tiêu còn ${amount}`,
    cutCategory: (label: string | null, amount: string) =>
      label ? `Giảm chi ${label} ${amount}/tháng` : `Giảm chi ${amount}/tháng`,
    cutNotEnough: "Cần kết hợp thêm cách khác.",
  },

  deleteConfirm: {
    title: "Xóa mục tiêu?",
    description: "Mục tiêu và lịch sử góp/rút sẽ bị xóa, không hoàn tác được.",
    confirm: "Xóa mục tiêu",
  },

  ledger: {
    contributeTitle: "Góp vào mục tiêu",
    withdrawTitle: "Rút khỏi mục tiêu",
    amount: "Số tiền",
    submitDeposit: "Góp",
    submitWithdraw: "Rút",
    commitmentLabel: "Gõ lại câu sau để xác nhận rút:",
    exceeds: "Vượt số đã góp",
  },

  /** Trade-off shown before a withdrawal; `weeks` unknown -> only the amount is stated. */
  withdrawTradeoff: (amount: string, weeks: number | "unknown") =>
    weeks === "unknown"
      ? `Rút ${amount} sẽ làm số đã góp giảm tương ứng.`
      : `Rút ${amount} sẽ lùi mục tiêu khoảng ${weeks} tuần.`,
  /** Sentence the user must retype to confirm a withdrawal. */
  commitmentPhrase: (name: string) => `Tôi chấp nhận lùi mục tiêu ${name}`,

  milestone: (m: number) => (m === 0 ? "Chưa đạt mốc nào" : `Đã đạt mốc ${m}%`),
} as const;
