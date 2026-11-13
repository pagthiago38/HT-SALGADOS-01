import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { History, Pencil, Plus, XCircle } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { brl, fmtDate, MOVEMENT_LABELS } from "../lib/format";
import { Kpi, Loading, PageHeader, Panel, PeriodFilter, ReasonDialog, StatusBadge, usePeriod, Empty } from "../components/shared";
import { Button } from "../components/ui/button";
import MovementDialog from "../components/MovementDialog";
import { HistoryDialog } from "./Despesas";

const KIND_LABEL = { venda: "Venda", despesa: "Despesa", compra: "Compra", ...MOVEMENT_LABELS };

const Separation = ({ d }) => (
  <Panel title="Faturamento ≠ Lucro ≠ Dinheiro disponível" className="mb-6" testid="finance-separation">
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl bg-[#F6F3EE] p-4"><p className="kpi-label">Faturamento do período</p><p className="kpi-value text-slate-900">{brl(d.revenue)}</p><p className="text-xs text-slate-500">Tudo o que foi vendido.</p></div>
      <div className="rounded-xl bg-[#F6F3EE] p-4"><p className="kpi-label">Lucro restante do período</p><p className={`kpi-value ${d.remaining_profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{brl(d.remaining_profit)}</p><p className="text-xs text-slate-500">Após custos, despesas e destinações.</p></div>
      <div className="rounded-xl bg-[#F6F3EE] p-4"><p className="kpi-label">Dinheiro disponível em caixa</p><p className={`kpi-value ${d.balances.cash >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{brl(d.balances.cash)}</p><p className="text-xs text-slate-500">Saldo acumulado real.</p></div>
    </div>
  </Panel>
);

export default function Financeiro() {
  const [period, setPeriod] = usePeriod("month");
  const [d, setD] = useState(null);
  const [dlg, setDlg] = useState({ open: false, editing: null });
  const [cancelId, setCancelId] = useState(null);
  const [hist, setHist] = useState(null);
  const load = useCallback(() => api.get("/finance", { params: { start: period.start, end: period.end } }).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e))), [period]);
  useEffect(() => {
    load();
  }, [load]);
  const cancel = async (reason) => {
    try {
      await api.post(`/movements/${cancelId}/cancel`, { reason });
      toast.success("Lançamento cancelado (mantido no histórico)");
      load();
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    }
  };
  if (!d) return <Loading />;
  const t = d.totals;

  return (
    <div>
      <PageHeader title="Financeiro" subtitle="Entradas, saídas, compras, retiradas, investimentos e saldo de caixa.">
        <Button onClick={() => setDlg({ open: true, editing: null })} className="h-11 bg-orange-600 hover:bg-orange-700" data-testid="movement-new-btn"><Plus className="mr-1 h-4 w-4" />Novo lançamento</Button>
      </PageHeader>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 stagger">
        <Kpi testid="fin-cash" label="Saldo de caixa" value={d.balances.cash} />
        <Kpi testid="fin-working-capital" label="Capital de giro" value={d.balances.working_capital} hint={`Caixa + estoque ${brl(d.balances.stock_value)}`} />
        <Kpi testid="fin-investment" label="Investimentos" value={d.balances.investment} toneMode="neutral" />
        <Kpi testid="fin-reserve" label="Reserva de emergência" value={d.balances.reserve} toneMode="neutral" />
      </div>
      <Separation d={d} />
      <div className="mb-4"><PeriodFilter value={period} onChange={setPeriod} /></div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Entradas de vendas" value={t.sales_in} toneMode="pos" testid="fin-sales-in" />
        <Kpi label="Saídas (despesas)" value={t.expenses_out} toneMode="neg" />
        <Kpi label="Compras" value={t.purchases_out} toneMode="neg" />
        <Kpi label="Retiradas" value={t.withdrawals} toneMode="neg" />
        <Kpi label="Investido (líq.)" value={t.investments} toneMode="neutral" />
        <Kpi label="Aportes" value={t.contributions} toneMode="pos" />
        <Kpi label="Fluxo líquido" value={t.net_cash_flow} testid="fin-net-flow" />
      </div>
      <Panel title="Movimentações do período" testid="finance-ledger">
        {d.entries.length === 0 ? <Empty text="Sem movimentações" /> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th className="num">Valor</th><th>Status</th><th /></tr></thead>
            <tbody>{d.entries.map((e) => (
              <tr key={e.id} className={e.status !== "ativo" ? "opacity-60" : ""}>
                <td>{fmtDate(e.date)}</td>
                <td><span className="badge badge-muted">{KIND_LABEL[e.kind] || e.kind}</span></td>
                <td className="text-sm">{e.source === "movement" ? e.raw.note || "—" : e.label}</td>
                <td className={`num font-semibold ${e.direction === "in" ? "text-emerald-600" : "text-rose-600"}`}>{e.direction === "in" ? "+" : "−"}{brl(e.amount)}</td>
                <td><StatusBadge status={e.status} /></td>
                <td className="whitespace-nowrap text-right">
                  {e.source === "movement" && e.raw.history?.length > 0 && <Button size="icon" variant="ghost" onClick={() => setHist(e.raw)}><History className="h-4 w-4" /></Button>}
                  {e.source === "movement" && e.status === "ativo" && <>
                    <Button size="icon" variant="ghost" onClick={() => setDlg({ open: true, editing: e.raw })} data-testid={`movement-edit-${e.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-rose-600" onClick={() => setCancelId(e.id)} data-testid={`movement-cancel-${e.id}`}><XCircle className="h-4 w-4" /></Button>
                  </>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="mt-3 text-xs text-slate-400">Despesas e compras são corrigidas na página Despesas; vendas, na página Vendas.</p>
      </Panel>
      <MovementDialog open={dlg.open} editing={dlg.editing} onOpenChange={(o) => setDlg((x) => ({ ...x, open: o }))} onSaved={load} />
      <ReasonDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)} title="Cancelar lançamento" onConfirm={cancel} />
      <HistoryDialog item={hist} onClose={() => setHist(null)} />
    </div>
  );
}
