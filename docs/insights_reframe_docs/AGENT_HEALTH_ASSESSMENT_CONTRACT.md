# M-Your Agent Health Assessment Contract (v1.0)

## Overview & Architecture Context

This document specifies the exact upstream contract between the **MSB PFM Web Frontend / BFF** and the external **M-Your Proactive Agent Service** (typically hosted in the `personal-pfm-agent` repository).

In the PFM Home Carousel, the Home screen surfaces:
1. **Slide 1**: Financial Health Score Overview (`pfm-health-v0`).
2. **Slide 2**: Highest-priority insight candidate (`priority 0` or `1`).
3. **Slide 3**: Second-highest-priority insight candidate.

When the customer taps Slide 1 (Financial Health Score), a modal sheet opens displaying:
- Deterministic score, coverage, pillar breakdowns, and 8 metric details computed by the pure TypeScript engine (`src/domain/engine/health-score.ts`).
- **A qualitative AI assessment section** ("Nhận xét của M-Your" / "Đánh giá từ trợ lý tài chính").

To prevent redundant calls, the PFM BFF sends a single request containing the snapshot to the agent endpoint, and expects a unified response containing both the candidate selection and the qualitative health assessment.

---

## Endpoint Contract

### 1. Request: `POST /proactive-insights`

The PFM service sends the exact snapshot generated for the current customer session:

```json
{
  "snapshot_id": "<64-character SHA-256 hash of canonical snapshot>",
  "snapshot": {
    "schemaVersion": "2.0",
    "asOf": "2026-09-15T00:00:00.000Z",
    "currency": "VND",
    "period": "2026-09",
    "healthScore": {
      "asOf": "2026-09-15T00:00:00.000Z",
      "policyVersion": "pfm-health-v0",
      "overallScore": 88,
      "tier": "healthy",
      "scoreCoverage": 0.625,
      "pillars": {
        "SPEND": 100,
        "SAVE": 100,
        "BORROW": 100,
        "PLAN_PROTECT": 50
      },
      "metrics": [
        {
          "metricId": "SPENDING_TO_INCOME",
          "pillar": "SPEND",
          "label": "Tỷ lệ chi tiêu trên thu nhập",
          "score": 100,
          "weight": 0.125,
          "rawValue": 0.67,
          "rawUnit": "ratio",
          "source": "msb",
          "period": "2026-09",
          "observationDays": 30,
          "isAvailable": true
        }
      ]
    },
    "candidates": [
      {
        "id": "spending:jar:essentials",
        "topic": "spending",
        "priority": 1,
        "severity": "attention",
        "confidence": "recorded",
        "title": "Hũ \"Thiết yếu\" đang gần hạn mức",
        "body": "Xem lại chi tiêu trong hũ và trao đổi với M-Your về cách điều chỉnh phù hợp.",
        "metric": { "label": "Còn lại · Thiết yếu", "value": 1651000, "unit": "VND" },
        "facts": { "rule_id": "jar_plan_pressure", "semantic_state": "near_limit" }
      }
    ]
  }
}
```

### 2. Response: `200 OK`

```json
{
  "snapshot_id": "<must match request snapshot_id>",
  "candidate_id": "spending:jar:essentials",
  "title": "<Concise Vietnamese title, max 70 chars, no digits/URLs>",
  "body": "<Concise Vietnamese body, max 240 chars, no digits/URLs>",
  "health_score_assessment": {
    "snapshot_id": "<must match request snapshot_id>",
    "source": "agent",
    "summary": "Tình hình tài chính tổng thể của bạn ở mức Lành mạnh (88/100). Dòng tiền chi tiêu và quỹ dự phòng đang duy trì rất tốt.",
    "pillar_assessments": [
      {
        "pillar": "SPEND",
        "status": "strength",
        "explanation": "Chi tiêu chiếm 67% thu nhập, nằm trong ngưỡng tối ưu (dưới 70%)."
      },
      {
        "pillar": "SAVE",
        "status": "strength",
        "explanation": "Quỹ dự phòng thanh khoản đủ trang trải trên 6 tháng chi tiêu cơ bản."
      },
      {
        "pillar": "BORROW",
        "status": "strength",
        "explanation": "Nghĩa vụ trả nợ được kiểm soát ở mức an toàn."
      },
      {
        "pillar": "PLAN_PROTECT",
        "status": "watch",
        "explanation": "Tiến độ mục tiêu đạt khoảng 50% và chưa ghi nhận hợp đồng bảo hiểm bảo vệ."
      }
    ],
    "strengths": [
      "Chi tiêu kỷ luật dưới 70% thu nhập",
      "Dự phòng khẩn cấp dồi dào trên 6 tháng"
    ],
    "areas_to_watch": [
      "Kế hoạch tích lũy dài hạn và bảo vệ tài chính"
    ],
    "recommended_actions": [
      "Cân nhắc bổ sung gói bảo hiểm phù hợp để hoàn thiện lá chắn bảo vệ",
      "Tiếp tục duy trì nhịp chi tiêu hũ Thiết yếu trước ngày thanh toán"
    ],
    "data_limitations": [
      "Độ phủ dữ liệu đạt 62.5% do chưa kết nối bảo hiểm và báo cáo tín dụng mở rộng"
    ]
  }
}
```

---

## Validation & Safety Constraints (Enforced in PFM BFF)

The PFM BFF implements runtime validation via `validHealthScoreAssessment` in `src/insights/proactive/home-contract.ts`:
1. **Snapshot ID Binding**: `health_score_assessment.snapshot_id` must match the exact `snapshotId` sent in the request. Mismatched IDs are rejected (`null`).
2. **Pillar Enums**: Only `"SPEND"`, `"SAVE"`, `"BORROW"`, and `"PLAN_PROTECT"` are allowed. Statuses must be `"strength"`, `"watch"`, or `"insufficient_data"`.
3. **Length Bounding**:
   - `summary`: max 600 characters.
   - `explanation`: max 400 characters.
   - String array items (`strengths`, `areas_to_watch`, `recommended_actions`, `data_limitations`): max 300 characters each, max 10 items.
4. **Honest Empty State**: If the external agent service has not yet rolled out `health_score_assessment` or is unreachable, the PFM UI renders an honest fallback banner:
   *"Đánh giá từ trợ lý tài chính hiện chưa sẵn sàng. Bạn vẫn có thể xem chi tiết điểm thành phần bên dưới."*
   The PFM client never fabricates or hallucinates AI text client-side.
5. **No Official Regulatory Claim**: The assessment is labeled as an explanatory assistant view under policy `pfm-health-v0`, not an official certified credit/FHN report.

---

## External Rollout Dependencies

- **Repository**: `personal-pfm-agent` (or external MSB AI microservice).
- **Service Route**: `POST /proactive-insights`.
- **System Prompt**: Add instructions to generate `health_score_assessment` alongside the candidate selection using the injected `snapshot.healthScore` facts.
