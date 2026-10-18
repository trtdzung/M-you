import { describe, expect, it } from "vitest";
import { securityScore, type SecurityScoreInput } from "../security-score";

describe("securityScore", () => {
  const allOff: SecurityScoreInput = {
    passwordUpdated: false,
    faceId: false,
    advanced: false,
    aiProtect: false,
    antiPhishing: false,
    activeEmergencyContacts: 0,
    trustedContacts: 0,
  };

  it("calculates minimum base score when all optional features are disabled", () => {
    const res = securityScore(allOff);
    // Base: 10 (PIN) + 10 (face verification) = 20 auth, 0 protection
    expect(res.auth).toBe(20);
    expect(res.protection).toBe(0);
    expect(res.total).toBe(20);
    expect(res.level).toBe("Tiêu chuẩn");
    // Top 2 steps by points (15 points each: antiPhishing, emergencyContacts)
    expect(res.nextSteps).toHaveLength(2);
    expect(res.nextSteps[0]).toMatchObject({ label: "Mã chống giả mạo", points: 15 });
    expect(res.nextSteps[1]).toMatchObject({ label: "Người thân khẩn cấp", points: 15 });
  });

  it("calculates maximum score 100 with level 'Rất cao' when all features are active", () => {
    const allOn: SecurityScoreInput = {
      passwordUpdated: true, // 15
      faceId: true, // 5
      advanced: true, // 10
      aiProtect: true, // 10
      antiPhishing: true, // 15
      activeEmergencyContacts: 2, // 15
      trustedContacts: 3, // 10
    };

    const res = securityScore(allOn);
    // auth: 10 + 15 + 10 + 5 + 10 = 50
    // protection: 10 + 15 + 15 + 10 = 50
    // total: 100
    expect(res.auth).toBe(50);
    expect(res.protection).toBe(50);
    expect(res.total).toBe(100);
    expect(res.level).toBe("Rất cao");
    expect(res.nextSteps).toEqual([]);
  });

  it("categorizes levels correctly across thresholds (60 and 85)", () => {
    // 55 points (< 60) -> "Tiêu chuẩn"
    const score55: SecurityScoreInput = {
      ...allOff,
      passwordUpdated: true, // +15
      antiPhishing: true, // +15
      aiProtect: true, // +10
      // 20 + 40 = 60 wait: base 20 + 15 + 15 + 10 = 60
    };
    expect(securityScore(score55).total).toBe(60);
    expect(securityScore(score55).level).toBe("Cao");

    // 55 points: base 20 + 15 + 10 + 10 = 55
    const scoreUnder60: SecurityScoreInput = {
      ...allOff,
      passwordUpdated: true, // +15
      aiProtect: true, // +10
      trustedContacts: 1, // +10
    };
    expect(securityScore(scoreUnder60).total).toBe(55);
    expect(securityScore(scoreUnder60).level).toBe("Tiêu chuẩn");

    // 85 points -> "Rất cao"
    const score85: SecurityScoreInput = {
      ...allOff,
      passwordUpdated: true, // +15
      faceId: true, // +5
      advanced: true, // +10
      aiProtect: true, // +10
      antiPhishing: true, // +15
      activeEmergencyContacts: 1, // +15
      // 20 + 70 = 90. Let's adjust to exactly 85:
      // Remove faceId (+5) -> 85
    };
    const scoreExactly85 = { ...score85, faceId: false };
    expect(securityScore(scoreExactly85).total).toBe(85);
    expect(securityScore(scoreExactly85).level).toBe("Rất cao");
  });

  it("returns at most 2 highest priority incomplete steps", () => {
    const res = securityScore({
      ...allOff,
      antiPhishing: true, // 15 done
      activeEmergencyContacts: 1, // 15 done
    });

    // Next highest should be passwordUpdated (15), then aiProtect (10)
    expect(res.nextSteps).toHaveLength(2);
    expect(res.nextSteps[0].label).toBe("Đổi mật khẩu");
    expect(res.nextSteps[0].points).toBe(15);
    expect(res.nextSteps[1].label).toBe("M-You bảo vệ bạn");
    expect(res.nextSteps[1].points).toBe(10);
  });
});
