import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { brl, pct, toNum } from "../lib/format";
import { costBreakdown } from "../lib/finance";

export const COST_DEFAULTS = { packaging: "0", freight: "0", extra_costs: "0", card_fee_pct: "0", tax_pct: "0", target_margin_pct: "30" };
export const COST_KEYS = Object.keys(COST_DEFAULTS);
export const costsToForm = (src) => Object.fromEntries(COST_KEYS.map((k) => [k, String(src?.[k] ?? COST_DEFAULTS[k])]));
export const costsToBody = (f) => Object.fromEntries(COST_KEYS.map((k) => [k, toNum(f[k])]));

const FIELDS = [
  ["packaging", "Embalagem (R$)"], ["freight", "Frete (R$)"], ["extra_costs", "Custos extras (R$)"],
  ["card_fee_pct", "Taxa de cartão (%)"], ["tax_pct", "Imposto (%)"], ["target_margin_pct", "Margem desejada (%)"],
];

export function CostFields({ f, setF, prefix }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Composição do custo unitário</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FIELDS.map(([k, l]) => (
          <div key={k}><Label className="text-xs">{l}</Label>
            <Input className="mt-1 h-9" inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`${prefix}-${k}-input`} /></div>
        ))}
      </div>
    </div>
  );
}

const Cell = ({ label, value, cls = "", testid }) => (
  <div><p className="kpi-label">{label}</p><p className={`font-mono text-sm font-bold ${cls}`} data-testid={testid}>{value}</p></div>
);

export function CostSummary({ base, price, f, prefix, onUseSuggested }) {
  const b = costBreakdown(base, price, costsToBody(f));
  const c = b.contribution >= 0 ? "text-emerald-600" : "text-rose-600";
  return (
    <div className="rounded-xl bg-[#F6F3EE] p-4" data-testid={`${prefix}-cost-summary`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell label="Custo mercadoria" value={brl(base)} />
        <Cell label="Cartão + imposto" value={brl(b.card_fee_value + b.tax_value)} />
        <Cell label="Custo unitário total" value={brl(b.unit_cost_total)} cls="text-rose-600" testid={`${prefix}-unit-cost-total`} />
        <Cell label="Margem contribuição" value={`${brl(b.contribution)} · ${pct(b.contribution_margin)}`} cls={c} testid={`${prefix}-contribution-margin`} />
        <Cell label="Margem de venda" value={pct(b.sales_margin)} cls={b.sales_margin >= 0 ? "text-emerald-600" : "text-rose-600"} testid={`${prefix}-sales-margin`} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-slate-300 pt-3">
        <span className="text-sm">Preço sugerido ({pct(toNum(f.target_margin_pct))} de margem): <b className="font-mono text-orange-600" data-testid={`${prefix}-suggested-price`}>{b.suggested_price === null ? "inviável" : brl(b.suggested_price)}</b></span>
        {b.suggested_price !== null && <Button size="sm" variant="outline" onClick={() => onUseSuggested(b.suggested_price.toFixed(2))} data-testid={`${prefix}-use-suggested-btn`}>Usar preço sugerido</Button>}
      </div>
    </div>
  );
}
