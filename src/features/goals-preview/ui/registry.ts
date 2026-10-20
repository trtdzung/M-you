import type { ComponentType } from "react";
import type { ScreenId, ScreenProps } from "../model/screens";
import { FlowMap } from "./screens/entry/FlowMap";
import { HomeMock } from "./screens/entry/HomeMock";
import { TemplatePick } from "./screens/create/TemplatePick";
import { GoalInfo } from "./screens/create/GoalInfo";
import { OpenAccountConfirm } from "./screens/create/OpenAccountConfirm";
import { StandingOrderSetup } from "./screens/create/StandingOrderSetup";
import { CreateSuccess } from "./screens/create/CreateSuccess";
import { GoalList } from "./screens/list/GoalList";
import { GoalDetail } from "./screens/detail/GoalDetail";
import { DepositFlow } from "./screens/detail/DepositFlow";
import { WithdrawFlow } from "./screens/detail/WithdrawFlow";
import { StandingOrderManage } from "./screens/detail/StandingOrderManage";
import { EditTarget } from "./screens/detail/EditTarget";
import { CloseGoalFlow } from "./screens/detail/CloseGoalFlow";
import { AddAsset } from "./screens/assets/AddAsset";
import { RevalueAsset } from "./screens/assets/RevalueAsset";
import { MsbAssetDetail } from "./screens/assets/MsbAssetDetail";
import { SellAsset } from "./screens/assets/SellAsset";
import { InvestSuggest } from "./screens/invest/InvestSuggest";
import { InvestConfirm } from "./screens/invest/InvestConfirm";
import { MaturityChoice } from "./screens/invest/MaturityChoice";
import { LoanAppHome } from "./screens/loan-app/LoanAppHome";
import { LoanAppSurvey } from "./screens/loan-app/LoanAppSurvey";
import { LoanSimulator } from "./screens/loan/LoanSimulator";
import { LoanBlocked } from "./screens/loan/LoanBlocked";
import { LoanApply } from "./screens/loan/LoanApply";
import { DueResult } from "./screens/lifecycle/DueResult";
import { AchievedIntro } from "./screens/lifecycle/AchievedIntro";
import { RepayOverview } from "./screens/lifecycle/RepayOverview";
import { RepaySchedule } from "./screens/lifecycle/RepaySchedule";
import { Prepay } from "./screens/lifecycle/Prepay";
import { CompletedCelebration } from "./screens/lifecycle/CompletedCelebration";
import { MissedOptions } from "./screens/lifecycle/MissedOptions";

export interface ScreenDef {
  component: ComponentType<ScreenProps>;
  /** Default title (screens render their own header; used by the flow map / test panel). */
  title: string;
  group: "entry" | "create" | "list" | "detail" | "assets" | "invest" | "loan" | "lifecycle";
  /** Params the screen expects (documentation for the test panel jump list). */
  needs?: ("goalId" | "assetId" | "loanId")[];
}

/** Single registry of every screen. Later tasks edit their screen files, not this map. */
export const SCREEN_REGISTRY: Record<ScreenId, ScreenDef> = {
  FlowMap: { component: FlowMap, title: "Bản đồ luồng", group: "entry" },
  HomeMock: { component: HomeMock, title: "Trang chủ", group: "entry" },
  TemplatePick: { component: TemplatePick, title: "Chọn loại mục tiêu", group: "create" },
  GoalInfo: { component: GoalInfo, title: "Thông tin mục tiêu", group: "create" },
  OpenAccountConfirm: { component: OpenAccountConfirm, title: "Mở tài khoản mục tiêu", group: "create", needs: ["goalId"] },
  StandingOrderSetup: { component: StandingOrderSetup, title: "Trích tiền tự động", group: "create", needs: ["goalId"] },
  CreateSuccess: { component: CreateSuccess, title: "Tạo mục tiêu thành công", group: "create", needs: ["goalId"] },
  GoalList: { component: GoalList, title: "Mục tiêu của tôi", group: "list" },
  GoalDetail: { component: GoalDetail, title: "Chi tiết mục tiêu", group: "detail", needs: ["goalId"] },
  DepositFlow: { component: DepositFlow, title: "Nạp tiền", group: "detail", needs: ["goalId"] },
  WithdrawFlow: { component: WithdrawFlow, title: "Rút tiền", group: "detail", needs: ["goalId"] },
  StandingOrderManage: { component: StandingOrderManage, title: "Trích tiền tự động", group: "detail", needs: ["goalId"] },
  EditTarget: { component: EditTarget, title: "Chỉnh sửa mục tiêu", group: "detail", needs: ["goalId"] },
  CloseGoalFlow: { component: CloseGoalFlow, title: "Đóng mục tiêu", group: "detail", needs: ["goalId"] },
  AddAsset: { component: AddAsset, title: "Thêm tài sản", group: "assets", needs: ["goalId"] },
  RevalueAsset: { component: RevalueAsset, title: "Định giá lại tài sản", group: "assets", needs: ["goalId", "assetId"] },
  MsbAssetDetail: { component: MsbAssetDetail, title: "Chi tiết tài sản", group: "assets", needs: ["goalId", "assetId"] },
  SellAsset: { component: SellAsset, title: "Bán tài sản", group: "assets", needs: ["goalId", "assetId"] },
  InvestSuggest: { component: InvestSuggest, title: "Gợi ý đầu tư", group: "invest", needs: ["goalId"] },
  InvestConfirm: { component: InvestConfirm, title: "Xác nhận đầu tư", group: "invest", needs: ["goalId"] },
  MaturityChoice: { component: MaturityChoice, title: "Tiền gửi đáo hạn", group: "invest", needs: ["goalId", "assetId"] },
  LoanAppHome: { component: LoanAppHome, title: "Vay", group: "loan", needs: ["goalId"] },
  LoanAppSurvey: { component: LoanAppSurvey, title: "Khảo sát thông tin", group: "loan", needs: ["goalId"] },
  LoanSimulator: { component: LoanSimulator, title: "Mô phỏng khoản vay", group: "loan", needs: ["goalId"] },
  LoanBlocked: { component: LoanBlocked, title: "Chưa thể vay", group: "loan", needs: ["goalId"] },
  LoanApply: { component: LoanApply, title: "Đăng ký vay", group: "loan", needs: ["goalId"] },
  DueResult: { component: DueResult, title: "Kết quả đến hạn", group: "lifecycle", needs: ["goalId"] },
  AchievedIntro: { component: AchievedIntro, title: "Đạt mục tiêu", group: "lifecycle", needs: ["goalId"] },
  RepayOverview: { component: RepayOverview, title: "Tích luỹ & trả nợ", group: "lifecycle", needs: ["goalId"] },
  RepaySchedule: { component: RepaySchedule, title: "Lịch trả nợ", group: "lifecycle", needs: ["goalId"] },
  Prepay: { component: Prepay, title: "Trả nợ trước hạn", group: "lifecycle", needs: ["goalId"] },
  CompletedCelebration: { component: CompletedCelebration, title: "Hoàn thành mục tiêu", group: "lifecycle", needs: ["goalId"] },
  MissedOptions: { component: MissedOptions, title: "Chưa đạt mục tiêu", group: "lifecycle", needs: ["goalId"] },
};
