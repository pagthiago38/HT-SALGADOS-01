import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeftRight } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { brl, fmtDateTime, num, toNum, STOCK_LABELS } from "../lib/format";
import { Kpi, PageHeader, Panel, Empty } from "../components/shared";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";

function MoveDialog({ product, onClose, onSaved }) {
  const [f, setF] = useState({ type: "entrada", qty: "", counted: "", unit_cost: "", update_cost: true, register_expense: true, note: "" });
  useEffect(() => {
    if (product) setF({ type: "entrada", qty: "", counted: String(product.stock), unit_cost: String(product.cost), update_cost: true, register_expense: true, note: "" });
  }, [product]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const body = { product_id: product.id, type: f.type, qty: toNum(f.qty), note: f.note, update_cost: f.update_cost, register_expense: f.register_expense };
    if (f.type === "ajuste") body.counted = toNum(f.counted);
    if (f.type === "entrada") body.unit_cost = toNum(f.unit_cost);
    try {
      await api.post("/stock/movements", body);
      toast.success("Movimentação registrada");
      onClose();
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="stock-move-dialog">
        <DialogHeader><DialogTitle>Movimentar: {product?.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500">Estoque atual: <b>{num(product?.stock)} {product?.unit}</b></p>
        <div><Label>Tipo</Label>
          <Select value={f.type} onValueChange={(v) => set("type", v)}><SelectTrigger className="mt-1" data-testid="stock-type-select"><SelectValue /></SelectTrigger>
            <SelectContent>{["entrada", "perda", "vencido", "ajuste"].map((t) => <SelectItem key={t} value={t}>{STOCK_LABELS[t]}</SelectItem>)}</SelectContent></Select>
        </div>
        {f.type === "ajuste" ? (
          <div><Label>Quantidade contada (correta)</Label><Input className="mt-1" inputMode="decimal" value={f.counted} onChange={(e) => set("counted", e.target.value)} data-testid="stock-counted-input" /></div>
        ) : (
          <div><Label>Quantidade</Label><Input className="mt-1" inputMode="decimal" value={f.qty} onChange={(e) => set("qty", e.target.value)} data-testid="stock-qty-input" /></div>
        )}
        {f.type === "entrada" && (
          <>
            <div><Label>Custo unitário pago (R$)</Label><Input className="mt-1" inputMode="decimal" value={f.unit_cost} onChange={(e) => set("unit_cost", e.target.value)} data-testid="stock-unit-cost-input" /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.update_cost} onCheckedChange={(v) => set("update_cost", v)} data-testid="stock-update-cost-switch" />Atualizar custo médio do produto</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.register_expense} onCheckedChange={(v) => set("register_expense", v)} data-testid="stock-register-expense-switch" />Lançar como compra de mercadoria (saída de caixa)</label>
            <p className="text-xs text-slate-500">Compras saem do caixa, mas não entram de novo no lucro: o custo só conta quando o produto é vendido.</p>
          </>
        )}
        <div><Label>Observação</Label><Textarea className="mt-1" value={f.note} onChange={(e) => set("note", e.target.value)} data-testid="stock-note-input" /></div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} className="bg-orange-600 hover:bg-orange-700" data-testid="stock-save-btn">Registrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const History = ({ moves, filter, setFilter }) => (
  <Panel title="Histórico de movimentações" className="mt-6" testid="stock-history"
    action={<Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-48" data-testid="stock-history-filter"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{Object.entries(STOCK_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>}>
    {moves.length === 0 ? <Empty text="Sem movimentações" /> : (
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th className="num">Qtd</th><th className="num">Custo un.</th><th>Obs.</th></tr></thead>
        <tbody>{moves.map((m) => (
          <tr key={m.id}><td className="whitespace-nowrap">{fmtDateTime(m.created_at)}</td><td>{m.product_name}</td><td><span className="badge badge-muted">{STOCK_LABELS[m.type]}</span></td>
            <td className={`num font-semibold ${m.qty >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{m.qty > 0 ? "+" : ""}{num(m.qty)}</td><td className="num">{brl(m.unit_cost)}</td><td className="text-xs text-slate-500">{m.note}</td></tr>
        ))}</tbody>
      </table></div>
    )}
  </Panel>
);

export default function Estoque() {
  const [products, setProducts] = useState([]);
  const [moves, setMoves] = useState([]);
  const [filter, setFilter] = useState("all");
  const [moving, setMoving] = useState(null);
  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([api.get("/products"), api.get("/stock/movements", { params: filter === "all" ? {} : { type: filter } })]);
      setProducts(p.data);
      setMoves(m.data);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, [filter]);
  useEffect(() => {
    load();
  }, [load]);
  const low = products.filter((p) => p.low_stock);
  const value = products.reduce((s, p) => s + Math.max(p.stock, 0) * p.cost, 0);

  return (
    <div>
      <PageHeader title="Estoque" subtitle="Entradas, saídas por vendas, perdas, vencidos e ajustes. Vendas baixam o estoque automaticamente." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Kpi label="Valor do estoque (a custo)" value={value} toneMode="neutral" testid="stock-value-kpi" />
        <Kpi label="Produtos ativos" value={products.length} money={false} toneMode="neutral" />
        <Kpi label="Com estoque baixo" value={low.length} money={false} toneMode={low.length ? "neg" : "pos"} testid="stock-low-kpi" />
      </div>
      {low.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800" data-testid="low-stock-alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><b>Estoque baixo:</b> {low.map((p) => `${p.name} (${num(p.stock)} ${p.unit})`).join(", ")}</div>
        </div>
      )}
      <Panel>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Produto</th><th className="num">Atual</th><th className="num">Mínimo</th><th>Situação</th><th className="num">Valor</th><th /></tr></thead>
          <tbody>{products.map((p) => (
            <tr key={p.id} data-testid={`stock-row-${p.id}`}>
              <td className="font-semibold">{p.name}</td><td className="num font-bold">{num(p.stock)} {p.unit}</td><td className="num">{num(p.min_stock)}</td>
              <td>{p.low_stock ? <span className="badge badge-warn">Baixo</span> : <span className="badge badge-ok">OK</span>}</td>
              <td className="num">{brl(Math.max(p.stock, 0) * p.cost)}</td>
              <td className="text-right"><Button size="sm" variant="outline" onClick={() => setMoving(p)} data-testid={`stock-move-${p.id}`}><ArrowLeftRight className="mr-1 h-3.5 w-3.5" />Movimentar</Button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </Panel>
      <History moves={moves} filter={filter} setFilter={setFilter} />
      <MoveDialog product={moving} onClose={() => setMoving(null)} onSaved={load} />
    </div>
  );
}
