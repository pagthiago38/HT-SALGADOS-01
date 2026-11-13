import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { History, Pencil, Plus, XCircle } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { brl, fmtDate, fmtDateTime, toNum, today, EXPENSE_CATEGORIES } from "../lib/format";
import { Kpi, PageHeader, Panel, PeriodFilter, ReasonDialog, StatusBadge, usePeriod, Empty } from "../components/shared";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";

function ExpenseDialog({ open, onOpenChange, editing, onSaved }) {
  const [f, setF] = useState({});
  useEffect(() => {
    if (open) setF(editing ? { ...editing, amount: String(editing.amount) } : { description: "", category: "Despesas fixas", amount: "", date: today(), note: "" });
  }, [open, editing]);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const save = async () => {
    const body = { description: f.description.trim(), category: f.category, amount: toNum(f.amount), date: f.date, note: f.note || "" };
    try {
      if (editing) await api.put(`/expenses/${editing.id}`, body);
      else await api.post("/expenses", body);
      toast.success(editing ? "Despesa corrigida (versão anterior guardada)" : "Despesa registrada");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="expense-dialog">
        <DialogHeader><DialogTitle>{editing ? "Corrigir despesa" : "Nova despesa"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Descrição</Label><Input className="mt-1" value={f.description || ""} onChange={set("description")} data-testid="expense-description-input" /></div>
          <div><Label>Categoria</Label>
            <Select value={f.category} onValueChange={set("category")}><SelectTrigger className="mt-1" data-testid="expense-category-select"><SelectValue /></SelectTrigger>
              <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>Valor (R$)</Label><Input className="mt-1" inputMode="decimal" value={f.amount || ""} onChange={set("amount")} data-testid="expense-amount-input" /></div>
          <div className="col-span-2"><Label>Data</Label><Input type="date" className="mt-1" value={f.date || ""} onChange={set("date")} data-testid="expense-date-input" /></div>
          <div className="col-span-2"><Label>Observação</Label><Textarea className="mt-1" value={f.note || ""} onChange={set("note")} data-testid="expense-note-input" /></div>
        </div>
        {f.category === "Mercadorias" && <p className="rounded-lg bg-orange-50 p-3 text-xs text-orange-800">Mercadorias são compras de estoque: saem do caixa, mas não reduzem o lucro de novo. O custo entra quando o produto é vendido (CMV).</p>}
        {f.category === "Embalagens" && <p className="rounded-lg bg-orange-50 p-3 text-xs text-orange-800">Se a embalagem já está no custo unitário dos produtos/combos, ela já é descontada a cada venda. Lance aqui só embalagens que não estão no custo, para não descontar duas vezes.</p>}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!f.description?.trim() || toNum(f.amount) <= 0} onClick={save} className="bg-orange-600 hover:bg-orange-700" data-testid="expense-save-btn">Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const HistoryDialog = ({ item, onClose }) => (
  <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
    <DialogContent data-testid="history-dialog">
      <DialogHeader><DialogTitle>Histórico de correções</DialogTitle></DialogHeader>
      {(item?.history || []).length === 0 ? <Empty text="Sem correções" /> : item.history.map((h, i) => (
        <div key={i} className="rounded-lg border border-slate-100 p-3 text-sm">
          <p className="text-xs text-slate-400">Alterado em {fmtDateTime(h.changed_at)}</p>
          <p>Antes: {h.description || h.note || h.type} · <b>{brl(h.amount)}</b> · {fmtDate(h.date)} {h.category ? `· ${h.category}` : ""}</p>
        </div>
      ))}
    </DialogContent>
  </Dialog>
);

export default function Despesas() {
  const [period, setPeriod] = usePeriod("month");
  const [rows, setRows] = useState([]);
  const [dlg, setDlg] = useState({ open: false, editing: null });
  const [cancelId, setCancelId] = useState(null);
  const [hist, setHist] = useState(null);
  const load = useCallback(() => api.get("/expenses", { params: { start: period.start, end: period.end } }).then((r) => setRows(r.data)).catch((e) => toast.error(errMsg(e))), [period]);
  useEffect(() => {
    load();
  }, [load]);
  const active = rows.filter((r) => r.status === "ativo");
  const byCat = EXPENSE_CATEGORIES.map((c) => ({ c, v: active.filter((r) => r.category === c).reduce((s, r) => s + r.amount, 0) }));
  const opTotal = active.filter((r) => r.category !== "Mercadorias").reduce((s, r) => s + r.amount, 0);
  const cancel = async (reason) => {
    try {
      await api.post(`/expenses/${cancelId}/cancel`, { reason });
      toast.success("Despesa cancelada (mantida no histórico)");
      load();
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    }
  };

  return (
    <div>
      <PageHeader title="Despesas" subtitle="Correções guardam a versão anterior; cancelamentos ficam no histórico.">
        <Button onClick={() => setDlg({ open: true, editing: null })} className="h-11 bg-orange-600 hover:bg-orange-700" data-testid="expense-new-btn"><Plus className="mr-1 h-4 w-4" />Nova despesa</Button>
      </PageHeader>
      <div className="mb-4"><PeriodFilter value={period} onChange={setPeriod} /></div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Operacionais" value={opTotal} toneMode="neg" testid="expense-op-total" hint="Entram no resultado" />
        {byCat.map(({ c, v }) => <Kpi key={c} label={c} value={v} toneMode={c === "Mercadorias" ? "neutral" : "neg"} hint={c === "Mercadorias" ? "Compra de estoque" : undefined} />)}
      </div>
      <Panel>
        {rows.length === 0 ? <Empty text="Nenhuma despesa no período" /> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th className="num">Valor</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className={r.status !== "ativo" ? "opacity-60" : ""} data-testid={`expense-row-${r.id}`}>
                <td>{fmtDate(r.date)}</td>
                <td><p className="font-semibold">{r.description}</p>{r.note && <p className="text-xs text-slate-500">{r.note}</p>}{r.cancel_reason && <p className="text-xs text-rose-500">Motivo: {r.cancel_reason}</p>}</td>
                <td><span className="badge badge-muted">{r.category}</span></td>
                <td className="num font-semibold text-rose-600">{brl(r.amount)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td className="whitespace-nowrap text-right">
                  {r.history?.length > 0 && <Button size="icon" variant="ghost" onClick={() => setHist(r)} data-testid={`expense-history-${r.id}`}><History className="h-4 w-4" /></Button>}
                  {r.status === "ativo" && <>
                    <Button size="icon" variant="ghost" onClick={() => setDlg({ open: true, editing: r })} data-testid={`expense-edit-${r.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-rose-600" onClick={() => setCancelId(r.id)} data-testid={`expense-cancel-${r.id}`}><XCircle className="h-4 w-4" /></Button>
                  </>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
      <ExpenseDialog open={dlg.open} editing={dlg.editing} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} onSaved={load} />
      <ReasonDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)} title="Cancelar despesa" onConfirm={cancel} />
      <HistoryDialog item={hist} onClose={() => setHist(null)} />
    </div>
  );
}
