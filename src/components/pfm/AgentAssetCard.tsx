"use client";

import { useState } from "react";
import { proposalKey } from "@/lib/agent-applied";
import { CATEGORY_LABELS, sendGoalAction, type AddAssetUi, type EditAssetUi } from "@/lib/agent-goal-api";
import { usePersona } from "@/providers/context";
import { GoalConfirmButton, GoalField, GoalLine, goalCardClass, goalFieldClass, parseDecimal, parseWhole, useGoalCardState, useGoalsNames } from "./agent-goal-shared";

/**
 * Renders an `AddAssetUi` (the fields depend on the group: a value typed by the customer, a market code with a quantity, or
 * a deposit / bond with its interest) or an `EditAssetUi` (new value, new quantity, or remove). The agent never prices an
 * asset: market and interest assets are valued by pfm from the quantity / the terms. Confirm sends the real action.
 */
export function AgentAssetCard({ form, fullWidth = false }: { form: AddAssetUi | EditAssetUi; fullWidth?: boolean }) {
  return form.type === "add_asset" ? <AddAsset form={form} fullWidth={fullWidth} /> : <EditAsset form={form} fullWidth={fullWidth} />;
}

const num = (s: string) => (s.trim() === "" ? null : parseDecimal(s));

function AddAsset({ form, fullWidth }: { form: AddAssetUi; fullWidth: boolean }) {
  const { persona } = usePersona();
  const card = useGoalCardState(proposalKey(persona.cif, form));
  const [name, setName] = useState(form.asset_name);
  const [percent, setPercent] = useState(String(form.count_percent));
  const [value, setValue] = useState(form.value === undefined ? "" : String(form.value));
  const [quantity, setQuantity] = useState(form.quantity === undefined ? "" : String(form.quantity));
  const [principal, setPrincipal] = useState(form.accrual ? String(form.accrual.principal) : "");
  const [rate, setRate] = useState(form.accrual ? String(form.accrual.rate_pa) : "");
  const [start, setStart] = useState(form.accrual?.start_date ?? "");
  const [maturity, setMaturity] = useState(form.accrual?.maturity_date ?? "");
  const [institution, setInstitution] = useState(form.institution ?? "");
  const done = card.status === "done";
  const names = useGoalsNames();
  const goalName = names === null ? undefined : (names.goals.find((g) => g.id === form.goal_id)?.name ?? null);
  const touch = (set: (v: string) => void) => (v: string) => {
    card.setProblem(null);
    set(v);
  };
  const market = form.instrument_id !== undefined;
  const accruing = form.accrual !== undefined;

  async function confirm() {
    const countPercent = num(percent);
    if (!name.trim()) return card.fail("Nhập tên tài sản.");
    if (countPercent === null || countPercent < 0 || countPercent > 100) return card.fail("Phần tính vào mục tiêu phải từ 0 đến 100%.");
    const base = { goalId: form.goal_id, name: name.trim(), category: form.category, countPercent, ...(institution.trim() ? { institution: institution.trim() } : {}) };
    if (market) {
      const qty = num(quantity);
      if (qty === null || qty <= 0) return card.fail("Số lượng phải lớn hơn 0.");
      card.start();
      const r = await sendGoalAction(persona.cif, { type: "addAsset", ...base, value: 0, source: "estimated", instrumentId: form.instrument_id, quantity: qty });
      return r.ok ? card.finish() : card.fail(r.error);
    }
    if (accruing) {
      const p = parseWhole(principal);
      const ratePa = num(rate);
      if (p === null || p <= 0) return card.fail("Số tiền gốc phải lớn hơn 0.");
      if (ratePa === null) return card.fail("Nhập lãi suất mỗi năm (%).");
      if (!start) return card.fail("Nhập ngày bắt đầu.");
      if (maturity && maturity < start) return card.fail("Ngày đáo hạn phải sau ngày bắt đầu.");
      card.start();
      const r = await sendGoalAction(persona.cif, {
        type: "addAsset",
        ...base,
        value: p,
        source: "estimated",
        accrual: { principal: p, ratePa, startDate: start, ...(maturity ? { maturityDate: maturity } : {}) },
      });
      return r.ok ? card.finish() : card.fail(r.error);
    }
    const v = parseWhole(value);
    if (v === null || v <= 0) return card.fail("Giá trị tài sản phải lớn hơn 0.");
    card.start();
    const r = await sendGoalAction(persona.cif, { type: "addAsset", ...base, value: v, source: "self_reported" });
    return r.ok ? card.finish() : card.fail(r.error);
  }

  return (
    <div className={goalCardClass(fullWidth)}>
      <p className="text-[11px] font-semibold text-muted">Đề xuất thêm tài sản · {CATEGORY_LABELS[form.category]}</p>
      <GoalLine goalName={goalName} />
      <GoalField label="Tên tài sản">
        <input value={name} onChange={(e) => touch(setName)(e.target.value)} disabled={done} className={goalFieldClass} />
      </GoalField>
      {!market && !accruing && (
        <GoalField label="Giá trị (VND)">
          <input value={value} onChange={(e) => touch(setValue)(e.target.value)} inputMode="numeric" disabled={done} className={`${goalFieldClass} font-semibold tabular-nums`} />
        </GoalField>
      )}
      {market && (
        <>
          <p className="text-xs text-muted">Mã: {form.instrument_id}</p>
          <GoalField label="Số lượng" hint="Giá trị được tính theo giá thị trường mỗi ngày.">
            <input value={quantity} onChange={(e) => touch(setQuantity)(e.target.value)} inputMode="decimal" disabled={done} className={`${goalFieldClass} font-semibold tabular-nums`} />
          </GoalField>
        </>
      )}
      {accruing && (
        <>
          <GoalField label="Số tiền gốc (VND)">
            <input value={principal} onChange={(e) => touch(setPrincipal)(e.target.value)} inputMode="numeric" disabled={done} className={`${goalFieldClass} font-semibold tabular-nums`} />
          </GoalField>
          <GoalField label="Lãi suất (%/năm)">
            <input value={rate} onChange={(e) => touch(setRate)(e.target.value)} inputMode="decimal" disabled={done} className={goalFieldClass} />
          </GoalField>
          <GoalField label="Ngày bắt đầu">
            <input type="date" value={start} onChange={(e) => touch(setStart)(e.target.value)} disabled={done} className={goalFieldClass} />
          </GoalField>
          <GoalField label="Ngày đáo hạn (nếu có)">
            <input type="date" value={maturity} onChange={(e) => touch(setMaturity)(e.target.value)} disabled={done} className={goalFieldClass} />
          </GoalField>
        </>
      )}
      <GoalField label="Phần tính vào mục tiêu (%)">
        <input value={percent} onChange={(e) => touch(setPercent)(e.target.value)} inputMode="decimal" disabled={done} className={goalFieldClass} />
      </GoalField>
      <GoalField label="Nơi đang giữ (nếu có)">
        <input value={institution} onChange={(e) => touch(setInstitution)(e.target.value)} disabled={done} className={goalFieldClass} />
      </GoalField>
      {card.problem && <p role="alert" className="text-xs text-negative">{card.problem}</p>}
      <GoalConfirmButton label="Thêm tài sản" busyLabel="Đang lưu…" doneLabel="Đã thêm tài sản" status={card.status} onClick={confirm} />
    </div>
  );
}

function EditAsset({ form, fullWidth }: { form: EditAssetUi; fullWidth: boolean }) {
  const { persona } = usePersona();
  const card = useGoalCardState(proposalKey(persona.cif, form));
  const [value, setValue] = useState(form.value === undefined ? "" : String(form.value));
  const [percent, setPercent] = useState(form.count_percent === undefined ? "" : String(form.count_percent));
  const [quantity, setQuantity] = useState(form.quantity === undefined ? "" : String(form.quantity));
  const done = card.status === "done";
  const names = useGoalsNames();
  const asset = names?.assets.find((a) => a.id === form.asset_id);
  const goalName = names === null ? undefined : asset ? (names.goals.find((g) => g.id === asset.goalId)?.name ?? null) : null;
  const touch = (set: (v: string) => void) => (v: string) => {
    card.setProblem(null);
    set(v);
  };

  async function confirm() {
    if (form.change === "remove") {
      card.start();
      const r = await sendGoalAction(persona.cif, { type: "removeAsset", assetId: form.asset_id });
      return r.ok ? card.finish() : card.fail(r.error);
    }
    if (form.change === "quantity") {
      const qty = num(quantity);
      if (qty === null || qty <= 0) return card.fail("Số lượng phải lớn hơn 0.");
      card.start();
      const r = await sendGoalAction(persona.cif, { type: "setAssetQuantity", assetId: form.asset_id, quantity: qty });
      return r.ok ? card.finish() : card.fail(r.error);
    }
    const v = parseWhole(value);
    const pct = percent.trim() === "" ? undefined : num(percent);
    if (v === null || v <= 0) return card.fail("Giá trị tài sản phải lớn hơn 0.");
    if (pct === null || (pct !== undefined && (pct < 0 || pct > 100))) return card.fail("Phần tính vào mục tiêu phải từ 0 đến 100%.");
    card.start();
    const r = await sendGoalAction(persona.cif, { type: "revalueAsset", assetId: form.asset_id, value: v, ...(pct === undefined ? {} : { countPercent: pct }) });
    return r.ok ? card.finish() : card.fail(r.error);
  }

  const title = form.change === "remove" ? "Đề xuất bỏ tài sản khỏi mục tiêu" : form.change === "quantity" ? "Đề xuất đổi số lượng tài sản" : "Đề xuất cập nhật giá trị tài sản";
  const label = form.change === "remove" ? "Bỏ tài sản" : "Cập nhật tài sản";
  return (
    <div className={goalCardClass(fullWidth)}>
      <p className="text-[11px] font-semibold text-muted">{title}</p>
      <p className="text-sm font-semibold text-text">{form.asset_name}</p>
      <GoalLine goalName={goalName} />
      {form.change === "revalue" && (
        <>
          <GoalField label="Giá trị mới (VND)">
            <input value={value} onChange={(e) => touch(setValue)(e.target.value)} inputMode="numeric" disabled={done} className={`${goalFieldClass} font-semibold tabular-nums`} />
          </GoalField>
          <GoalField label="Phần tính vào mục tiêu (%) (tuỳ chọn)">
            <input value={percent} onChange={(e) => touch(setPercent)(e.target.value)} inputMode="decimal" disabled={done} className={goalFieldClass} />
          </GoalField>
        </>
      )}
      {form.change === "quantity" && (
        <GoalField label="Số lượng mới">
          <input value={quantity} onChange={(e) => touch(setQuantity)(e.target.value)} inputMode="decimal" disabled={done} className={`${goalFieldClass} font-semibold tabular-nums`} />
        </GoalField>
      )}
      {form.change === "remove" && <p className="text-xs text-muted">Tài sản này sẽ không còn được tính vào mục tiêu.</p>}
      {card.problem && <p role="alert" className="text-xs text-negative">{card.problem}</p>}
      <GoalConfirmButton label={label} busyLabel="Đang lưu…" doneLabel={form.change === "remove" ? "Đã bỏ tài sản" : "Đã cập nhật"} status={card.status} onClick={confirm} />
    </div>
  );
}
