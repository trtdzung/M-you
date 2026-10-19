"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { formatVnd } from "@/features/goals-preview/format-money";
import type { ScreenProps } from "../../../model/screens";
import { FIXED_CATEGORY_LABEL } from "../../../model/labels";
import type { FixedAssetCategory, ValueSource } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { Amount } from "../../shared/Amount";
import { BottomActions } from "../../shared/BottomActions";
import { MoneyInput } from "../../shared/MoneyInput";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SourceTag } from "../../shared/SourceTag";
import { StepProgress } from "../../shared/StepProgress";
import { card, chip, chipSelected, errorBox, ghostButton, infoBox, input, label, primaryButton, screenPadding, secondaryButton, stepTitle } from "../../shared/styles";
import { DraftGuard, WIZARD_STEPS, wizardDeposit } from "./wizard";

type AssetKind = FixedAssetCategory | "msb_deposit";
const KIND_OPTIONS: { id: AssetKind; label: string; hint: string }[] = [
  { id: "car", label: "Xe ô tô", hint: "Ví dụ: xe cũ định bán khi mua xe mới" },
  { id: "motorbike", label: "Xe máy", hint: "Giá trị ước tính hiện tại" },
  { id: "house", label: "Nhà, đất", hint: "Chỉ tính một phần nếu bạn chưa định bán" },
  { id: "gold", label: "Vàng cất giữ", hint: "Giá trị theo giá vàng hôm nay" },
  { id: "msb_deposit", label: "Sổ tiết kiệm MSB", hint: "Khoản gửi sẵn có tại MSB" },
  { id: "other", label: "Tài sản khác", hint: "Bất kỳ tài sản nào bạn muốn tính vào" },
];
const PERCENTS = [30, 50, 70, 100];

/** Bước 3: tiền mang vào ngay + tài sản sẵn có. Có thể bỏ qua. */
export function OpeningFunds({ params }: ScreenProps) {
  return (
    <DraftGuard params={params} title="Vốn ban đầu">
      {(goal) => <OpeningFundsBody goalId={goal.id} initialDeposit={wizardDeposit(params)} />}
    </DraftGuard>
  );
}

function OpeningFundsBody({ goalId, initialDeposit }: { goalId: string; initialDeposit: number }) {
  const { state, dispatch, nav } = usePreview();
  const balance = state.customer.mainCasaBalance;
  const [deposit, setDeposit] = useState<number | null>(initialDeposit > 0 ? initialDeposit : null);
  const [adding, setAdding] = useState(false);
  const assets = state.assets.filter((a) => a.goalId === goalId && a.status !== "sold");

  // Asset form
  const [kind, setKind] = useState<AssetKind>("car");
  const [assetName, setAssetName] = useState("");
  const [assetValue, setAssetValue] = useState<number | null>(null);
  const [percent, setPercent] = useState(50);
  const [formTouched, setFormTouched] = useState(false);

  const depositValue = deposit ?? 0;
  const overBalance = depositValue > balance;

  const resetForm = () => {
    setAdding(false);
    setKind("car");
    setAssetName("");
    setAssetValue(null);
    setPercent(50);
    setFormTouched(false);
  };

  const saveAsset = () => {
    setFormTouched(true);
    if (!assetValue || assetValue < 1) return;
    const isMsb = kind === "msb_deposit";
    const category: FixedAssetCategory = isMsb ? "other" : kind;
    const fallback = isMsb ? "Sổ tiết kiệm MSB" : FIXED_CATEGORY_LABEL[category];
    const source: ValueSource = isMsb ? "msb" : "self_reported";
    dispatch({
      type: "addFixedAsset",
      goalId,
      name: assetName.trim() || fallback,
      category,
      value: assetValue,
      countPercent: isMsb ? 100 : percent,
      source,
    });
    resetForm();
  };

  const go = (amount: number) => {
    if (amount !== initialDeposit) nav.replace("OpeningFunds", { goalId, deposit: amount });
    nav.push("FeasibilityResult", { goalId, deposit: amount });
  };

  const isMsb = kind === "msb_deposit";

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Vốn ban đầu" subtitle="Không bắt buộc" />
      <StepProgress steps={WIZARD_STEPS} current={2} />

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className={stepTitle}>Chuyển tiền vào ngay</h2>
        <p className="text-[13px] leading-5 text-muted">
          Số dư tài khoản chính: <Amount amount={balance} source="msb" />
        </p>
        <MoneyInput
          label="Số tiền chuyển vào tài khoản mục tiêu"
          value={deposit}
          onChange={setDeposit}
          max={balance}
          hint="Để trống nếu bạn muốn bắt đầu từ 0 đồng."
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={stepTitle}>Tài sản sẵn có</h2>
        <p className="text-[13px] leading-5 text-muted">
          Xe cũ, sổ tiết kiệm… có thể được tính một phần vào mục tiêu. Giá trị tự khai sẽ luôn được gắn nhãn rõ.
        </p>

        {assets.map((a) => (
          <div key={a.id} className={`${card} flex items-center gap-3 !p-3 pl-4`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-text">{a.name}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                <Amount amount={a.value} source={a.source} /> · tính {a.countPercent}%
              </p>
            </div>
            <button
              type="button"
              aria-label={`Bỏ tài sản ${a.name}`}
              onClick={() => dispatch({ type: "removeAsset", assetId: a.id })}
              className={`${ghostButton} !text-negative`}
            >
              <Trash2 size={18} aria-hidden />
            </button>
          </div>
        ))}

        {adding ? (
          <div className={`${card} flex flex-col gap-3`}>
            <div className="flex items-center justify-between">
              <h3 className={stepTitle}>Thêm tài sản</h3>
              <button type="button" aria-label="Đóng" onClick={resetForm} className={ghostButton}>
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Loại tài sản">
              {KIND_OPTIONS.map((k) => (
                <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={kind === k.id ? chipSelected : chip} onClick={() => setKind(k.id)}>
                  {k.label}
                </button>
              ))}
            </div>
            <p className="text-[13px] text-muted">{KIND_OPTIONS.find((k) => k.id === kind)?.hint}</p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="asset-name" className={label}>
                Tên gọi (không bắt buộc)
              </label>
              <input id="asset-name" className={input} value={assetName} maxLength={40} onChange={(e) => setAssetName(e.target.value)} placeholder={isMsb ? "Sổ tiết kiệm MSB" : "Ví dụ: Toyota Vios 2018"} />
            </div>
            <MoneyInput
              label={isMsb ? "Số dư sổ tiết kiệm" : "Giá trị hiện tại (bạn tự ước tính)"}
              value={assetValue}
              onChange={setAssetValue}
              error={formTouched && !assetValue ? "Hãy nhập giá trị tài sản." : undefined}
            />
            {isMsb ? (
              <p className={infoBox}>Sổ tiết kiệm MSB được tính 100% vào mục tiêu.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <span className={label}>Tính bao nhiêu % vào mục tiêu?</span>
                <div className="flex flex-wrap gap-2">
                  {PERCENTS.map((p) => (
                    <button key={p} type="button" className={percent === p ? chipSelected : chip} onClick={() => setPercent(p)}>
                      {p}%
                    </button>
                  ))}
                </div>
                {assetValue ? (
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                    Được tính: <Amount amount={Math.round((assetValue * percent) / 100)} source="self_reported" />
                  </p>
                ) : (
                  <p className="text-[13px] text-muted">
                    Giá trị tự khai <SourceTag source="self_reported" className="align-middle" /> có thể sai lệch, nên bạn chỉ nên tính phần chắc chắn bán được.
                  </p>
                )}
              </div>
            )}
            <button type="button" className={secondaryButton} onClick={saveAsset}>
              Thêm tài sản
            </button>
          </div>
        ) : (
          <button type="button" className={secondaryButton} onClick={() => setAdding(true)}>
            <Plus size={18} aria-hidden /> Thêm tài sản
          </button>
        )}
      </section>

      {overBalance && <p className={errorBox}>Số tiền vượt số dư tài khoản chính ({formatVnd(balance)}). Hãy giảm bớt.</p>}

      <BottomActions inline>
        <button type="button" className={primaryButton} disabled={overBalance} onClick={() => go(depositValue)}>
          Tiếp tục
        </button>
        <button type="button" className={ghostButton + " self-center"} onClick={() => go(0)}>
          Bỏ qua, bắt đầu từ 0 đồng
        </button>
      </BottomActions>
    </div>
  );
}
