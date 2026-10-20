import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SecurityRecommendations } from "../SecurityRecommendations";
import { securityScore, type SecurityScoreInput } from "@/lib/security/security-score";

afterEach(cleanup);

const input: SecurityScoreInput = {
  pinSet: true, faceVerified: true, passwordUpdated: false, faceId: true,
  advanced: false, aiProtect: true, antiPhishing: false,
  activeEmergencyContacts: 0, trustedContacts: 3,
};

describe("Hub next-step recommendations between engine notices", () => {
  it("links the two incomplete steps to their existing setup screens using the current score", () => {
    render(<SecurityRecommendations suggestions={securityScore(input).nextSteps} />);
    expect(screen.getByRole("link", { name: "Mã chống giả mạo: Thiết lập ngay" })).toHaveAttribute("href", "/settings/anti-phishing");
    expect(screen.getByRole("link", { name: "Người thân khẩn cấp: Thiết lập ngay" })).toHaveAttribute("href", "/settings/emergency-contacts");
    expect(screen.getAllByLabelText("Tăng 15 điểm")).toHaveLength(2);
    expect(screen.getByText("Nhận ra tin nhắn, cuộc gọi thật từ MSB.")).toBeInTheDocument();
  });

  it("replaces completed steps with the engine's next priorities and their actual point values", () => {
    const score = securityScore({ ...input, antiPhishing: true, activeEmergencyContacts: 1 });
    render(<SecurityRecommendations suggestions={score.nextSteps} />);
    expect(screen.queryByRole("link", { name: "Mã chống giả mạo: Thiết lập ngay" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đổi mật khẩu: Thiết lập ngay" })).toHaveAttribute("href", "/settings/password");
    expect(screen.getByRole("link", { name: "Xác thực nâng cao: Thiết lập ngay" })).toHaveAttribute("href", "/settings/advanced");
    expect(screen.getByLabelText("Tăng 15 điểm")).toBeInTheDocument();
    expect(screen.getByLabelText("Tăng 10 điểm")).toBeInTheDocument();
  });
});
