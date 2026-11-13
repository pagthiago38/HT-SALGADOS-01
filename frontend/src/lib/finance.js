import { toNum } from "./format";

// Mirrors backend cost_breakdown().
export function costBreakdown(base, price, d) {
  const fixed = base + d.packaging + d.freight + d.extra_costs;
  const pctTotal = d.card_fee_pct + d.tax_pct;
  const total = fixed + (price * pctTotal) / 100;
  const contribution = price - total;
  const denom = 1 - (pctTotal + d.target_margin_pct) / 100;
  return {
    card_fee_value: (price * d.card_fee_pct) / 100, tax_value: (price * d.tax_pct) / 100, fixed_unit_cost: fixed, unit_cost_total: total, contribution,
    contribution_margin: price ? (contribution / price) * 100 : 0, sales_margin: price ? ((price - base) / price) * 100 : 0,
    suggested_price: denom > 0 ? Math.round((fixed / denom) * 100) / 100 : null,
  };
}

const ACTUAL_CAT = { despesas_fixas: "Despesas fixas", custos_extras: "Custos extras" };

// Mirrors backend distribute() so percentage edits preview live before saving.
export function distribute(settings, revenue, gross, op, expByCat = {}) {
  const bases = { faturamento: revenue, lucro_bruto: gross, resultado_operacional: op };
  const allowed = op > 0;
  const values = {};
  const items = settings.distribution.map((d) => {
    const base = bases[d.base] || 0;
    const v = (Math.max(base, 0) * toNum(d.pct)) / 100;
    if (d.mode === "destinacao") {
      values[d.key] = allowed ? v : 0;
      return { ...d, base_value: base, value: values[d.key] };
    }
    const cat = ACTUAL_CAT[d.key];
    return { ...d, base_value: base, value: v, actual: cat ? expByCat[cat] || 0 : null };
  });
  const pl = values.pro_labore || 0;
  const tithe = (pl * toNum(settings.tithe_pct)) / 100;
  const reserve = values.reserva || 0;
  const investment = values.investimento || 0;
  const remaining = allowed ? op - pl - reserve - investment : op;
  return { items, allowed, pro_labore: pl, tithe, pro_labore_net: pl - tithe, reserve, investment, remaining_profit: remaining, over_distributed: allowed && remaining < 0 };
}
