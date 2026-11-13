import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { brl, fmtDateTime, num } from "../../lib/format";
import { Panel, PeriodFilter, ReasonDialog, StatusBadge, usePeriod, Empty } from "../shared";
import { Button } from "../ui/button";

export default function SalesHistory({ refreshKey, onChanged }) {
  const [period, setPeriod] = usePeriod("day");
  const [sales, setSales] = useState([]);
  const [cancelId, setCancelId] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api.get("/sales", { params: { start: period.start, end: period.end } }).then((r) => setSales(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [period, refreshKey, tick]);

  const cancel = async (reason) => {
    try {
      await api.post(`/sales/${cancelId}/cancel`, { reason });
      toast.success("Venda cancelada e estoque estornado");
      setTick((t) => t + 1);
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    }
  };
  const active = sales.filter((s) => s.status === "ativa");

  return (
    <Panel title="Vendas registradas" className="mt-8" testid="sales-history" action={<PeriodFilter value={period} onChange={setPeriod} />}>
      <p className="mb-3 text-sm text-slate-500">{active.length} vendas ativas · <span className="font-mono font-semibold text-emerald-600" data-testid="sales-history-total">{brl(active.reduce((s, x) => s + x.total, 0))}</span></p>
      {sales.length === 0 ? <Empty text="Nenhuma venda no período" /> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>#</th><th>Data/hora</th><th>Itens</th><th className="num">Total</th><th>Status</th><th /></tr></thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} data-testid={`sale-row-${s.number}`} className={s.status !== "ativa" ? "opacity-60" : ""}>
                  <td className="font-mono">{s.number}</td>
                  <td className="whitespace-nowrap">{fmtDateTime(s.created_at)}</td>
                  <td className="min-w-[200px] text-xs">{s.items.map((i) => `${num(i.qty)}x ${i.name}`).join(", ")}{s.cancel_reason && <p className="text-rose-500">Motivo: {s.cancel_reason}</p>}</td>
                  <td className="num font-semibold">{brl(s.total)}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>{s.status === "ativa" && <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setCancelId(s.id)} data-testid={`sale-cancel-${s.number}`}>Cancelar</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ReasonDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)} title="Cancelar venda" description="A venda fica no histórico como cancelada, sai do faturamento e o estoque é devolvido." onConfirm={cancel} />
    </Panel>
  );
}
