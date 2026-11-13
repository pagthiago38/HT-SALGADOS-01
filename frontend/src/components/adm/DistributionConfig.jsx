import { Panel } from "../shared";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { brl, BASE_LABELS } from "../../lib/format";

export default function DistributionConfig({ draft, setDraft, dist }) {
  const upd = (key, field, value) => setDraft({ ...draft, distribution: draft.distribution.map((d) => (d.key === key ? { ...d, [field]: value } : d)) });
  return (
    <Panel title="Distribuição do resultado" testid="adm-distribution">
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Destinação</th><th>%</th><th>Base de cálculo</th><th className="num">Valor</th></tr></thead>
          <tbody>
            {dist.items.map((it) => (
              <tr key={it.key} data-testid={`dist-row-${it.key}`}>
                <td>
                  <p className="font-semibold">{it.label}</p>
                  <span className={`badge ${it.mode === "informativo" ? "badge-muted" : "badge-warn"}`}>{it.mode === "informativo" ? "Informativo" : "Destinação"}</span>
                </td>
                <td><Input className="h-9 w-20 text-center font-mono" inputMode="decimal" value={it.pct} onChange={(e) => upd(it.key, "pct", e.target.value)} data-testid={`dist-pct-${it.key}`} /></td>
                <td>
                  <Select value={it.base} onValueChange={(v) => upd(it.key, "base", v)}>
                    <SelectTrigger className="h-9 w-[180px]" data-testid={`dist-base-${it.key}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(BASE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="num">
                  <span className="font-semibold">{brl(it.value)}</span>
                  {it.actual !== null && it.actual !== undefined && <p className="text-[11px] text-slate-500">real: {brl(it.actual)}</p>}
                </td>
              </tr>
            ))}
            <tr>
              <td><p className="font-semibold">Dízimo</p><span className="badge badge-muted">sobre o pró-labore</span></td>
              <td><Input className="h-9 w-20 text-center font-mono" inputMode="decimal" value={draft.tithe_pct} onChange={(e) => setDraft({ ...draft, tithe_pct: e.target.value })} data-testid="dist-tithe-pct" /></td>
              <td className="text-sm text-slate-500">Pró-labore</td>
              <td className="num font-semibold">{brl(dist.tithe)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">Itens informativos apenas mostram a referência (ex.: 30% do faturamento para despesas fixas) ao lado do gasto real; não são descontados de novo do resultado.</p>
    </Panel>
  );
}
