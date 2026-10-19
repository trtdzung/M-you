import { getInvestProduct } from "../data/products";
import type { WorldState } from "../model/state";
import type { Asset, FixedAssetCategory, ISODate, LiquidAssetCategory, ValueSource } from "../model/types";
import { addMonths } from "./dates";
import { nextId } from "./ledger";
import { depositAccrued, fundPriceAt } from "./value";

/** Asset factories shared by scenario fixtures and the store reducer. */

export interface FixedAssetSpec {
  type: "fixed";
  name: string;
  category: FixedAssetCategory;
  value: number;
  costBasis?: number;
  valuationDate: ISODate;
  countPercent: number;
  source?: ValueSource;
}

export interface LiquidAssetSpec {
  type: "liquid";
  category: LiquidAssetCategory;
  productId: string;
  name?: string;
  /** Cash moved out of the goal account to buy it. */
  amount: number;
  createdAt: ISODate;
  termMonths?: number;
}

export function makeAsset(world: WorldState, goalId: string, spec: FixedAssetSpec | LiquidAssetSpec, createdAt: ISODate): Asset {
  const id = nextId(world, "asset");
  if (spec.type === "fixed") {
    return {
      id,
      goalId,
      type: "fixed",
      name: spec.name,
      category: spec.category,
      costBasis: spec.costBasis ?? spec.value,
      value: spec.value,
      valuationDate: spec.valuationDate,
      countPercent: spec.countPercent,
      source: spec.source ?? "self_reported",
      status: "held",
      createdAt,
    };
  }
  const product = getInvestProduct(spec.productId);
  const base = {
    id,
    goalId,
    type: "liquid" as const,
    category: spec.category,
    productId: spec.productId,
    name: spec.name ?? product?.name ?? "Sản phẩm MSB",
    costBasis: spec.amount,
    value: spec.amount,
    valuationDate: spec.createdAt,
    countPercent: 100,
    source: "msb" as const,
    status: "held" as const,
    createdAt: spec.createdAt,
  };
  if (product?.kind === "fund") {
    const price = fundPriceAt(product, spec.createdAt);
    return { ...base, units: Math.round((spec.amount / price) * 100) / 100, price };
  }
  if (product?.kind === "term_deposit") {
    const term = product.terms.find((t) => t.months === spec.termMonths) ?? product.terms[0];
    const maturityDate = addMonths(spec.createdAt, term.months);
    return {
      ...base,
      name: spec.name ?? `${product.name} ${term.months} tháng`,
      principal: spec.amount,
      ratePa: term.ratePa,
      termMonths: term.months,
      maturityDate,
      value: spec.amount + depositAccrued(spec.amount, term.ratePa, spec.createdAt, maturityDate),
    };
  }
  if (product?.kind === "savings") {
    return { ...base, principal: spec.amount, ratePa: product.ratePa };
  }
  if (product?.kind === "bond") {
    return {
      ...base,
      units: Math.floor(spec.amount / product.unitPrice),
      price: product.unitPrice,
      ratePa: product.couponPa,
      maturityDate: product.maturityDate,
    };
  }
  return base;
}
