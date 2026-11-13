import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { brl, num, pct, toNum } from "../lib/format";
import { PageHeader, Panel, Empty } from "../components/shared";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { CostFields, CostSummary, costsToBody, costsToForm } from "../components/CostComposer";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";

function ComboDialog({ open, onOpenChange, editing, products, onSaved }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState(true);
  const [items, setItems] = useState([]);
  const [costs, setCosts] = useState(costsToForm());
  useEffect(() => {
    if (!open) return;
    setCosts(costsToForm(editing));
    setName(editing?.name || "");
    setPrice(editing ? String(editing.price) : "");
    setActive(editing ? editing.active : true);
    setItems(editing ? editing.items.map((i) => ({ product_id: i.product_id, qty: String(i.qty) })) : [{ product_id: "", qty: "1" }]);
  }, [open, editing]);

  const pm = Object.fromEntries(products.map((p) => [p.id, p]));
  const cost = items.reduce((s, i) => s + (pm[i.product_id]?.cost || 0) * toNum(i.qty), 0);
  const individual = items.reduce((s, i) => s + (pm[i.product_id]?.price || 0) * toNum(i.qty), 0);
  const p = toNum(price);
  const upd = (idx, k, v) => setItems(items.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));

  const save = async () => {
    const body = { name: name.trim(), price: p, active, ...costsToBody(costs), items: items.filter((i) => i.product_id).map((i) => ({ product_id: i.product_id, qty: toNum(i.qty) })) };
    try {
      if (editing) await api.put(`/combos/${editing.id}`, body);
      else await api.post("/combos", body);
      toast.success("Combo salvo");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto" data-testid="combo-dialog">
        <DialogHeader><DialogTitle>{editing ? "Editar combo" : "Novo combo"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-[1fr_140px] gap-4">
          <div><Label>Nome</Label><Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} data-testid="combo-name-input" /></div>
          <div><Label>Preço (R$)</Label><Input className="mt-1" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="combo-price-input" /></div>
        </div>
        <div>
          <Label>Composição</Label>
          <div className="mt-2 space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="flex gap-2">
                <Select value={it.product_id} onValueChange={(v) => upd(idx, "product_id", v)}>
                  <SelectTrigger className="flex-1" data-testid={`combo-item-select-${idx}`}><SelectValue placeholder="Produto" /></SelectTrigger>
                  <SelectContent>{products.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="w-20 text-center" inputMode="decimal" value={it.qty} onChange={(e) => upd(idx, "qty", e.target.value)} data-testid={`combo-item-qty-${idx}`} />
                <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== idx))} data-testid={`combo-item-remove-${idx}`}><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setItems([...items, { product_id: "", qty: "1" }])} data-testid="combo-add-item-btn"><Plus className="mr-1 h-3.5 w-3.5" />Adicionar componente</Button>
        </div>
        <p className="text-xs text-slate-500">Custo dos componentes: <b className="font-mono text-rose-600" data-testid="combo-cost-preview">{brl(cost)}</b> · vendidos avulsos: <b className="font-mono">{brl(individual)}</b></p>
        <CostFields f={costs} setF={setCosts} prefix="combo" />
        <CostSummary base={cost} price={p} f={costs} prefix="combo" onUseSuggested={setPrice} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={active} onCheckedChange={setActive} data-testid="combo-active-switch" />Disponível para venda</label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!name.trim() || !items.some((i) => i.product_id)} className="bg-orange-600 hover:bg-orange-700" data-testid="combo-save-btn">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ComboCard = ({ c, onEdit, onDelete }) => (
  <div className="panel flex flex-col" data-testid={`combo-card-${c.id}`}>
    <div className="flex items-start justify-between gap-2">
      <div>
        <h3 className="font-display text-lg font-bold">{c.name}</h3>
        {!c.active && <span className="badge badge-off">Inativo</span>}
      </div>
      <p className="font-mono text-xl font-bold text-orange-600">{brl(c.price)}</p>
    </div>
    <ul className="my-4 space-y-1 text-sm text-slate-600">
      {c.items.map((i) => <li key={i.product_id}>{num(i.qty)}x {i.name} <span className="text-slate-400">({brl(i.unit_cost)} un.)</span></li>)}
    </ul>
    <div className="mt-auto grid grid-cols-3 gap-2 border-t border-dashed border-slate-200 pt-3 text-xs">
      <div><p className="text-slate-500">Custo total</p><p className="font-mono font-bold text-rose-600">{brl(c.unit_cost_total)}</p></div>
      <div><p className="text-slate-500">Contribuição</p><p className={`font-mono font-bold ${c.gross_profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{brl(c.gross_profit)}</p></div>
      <div><p className="text-slate-500">Margem contrib.</p><p className={`font-mono font-bold ${c.margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{pct(c.margin)}</p></div>
    </div>
    <p className="mt-2 text-xs text-slate-400">Componentes {brl(c.merch_cost)} · margem de venda {pct(c.sales_margin)} · sugerido {c.suggested_price === null ? "—" : brl(c.suggested_price)} · avulso {brl(c.individual_price)}</p>
    <div className="mt-3 flex gap-2">
      <Button size="sm" variant="outline" onClick={onEdit} data-testid={`combo-edit-${c.id}`}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
      <Button size="sm" variant="ghost" className="text-rose-600" onClick={onDelete} data-testid={`combo-delete-${c.id}`}><Trash2 className="mr-1 h-3.5 w-3.5" />Excluir</Button>
    </div>
  </div>
);

export default function Combos() {
  const [combos, setCombos] = useState([]);
  const [products, setProducts] = useState([]);
  const [dlg, setDlg] = useState({ open: false, editing: null });
  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([api.get("/combos", { params: { include_inactive: true } }), api.get("/products")]);
      setCombos(c.data);
      setProducts(p.data);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const remove = async (c) => {
    if (!window.confirm(`Excluir o combo "${c.name}"? As vendas antigas continuam no histórico.`)) return;
    await api.delete(`/combos/${c.id}`).then(() => toast.success("Combo excluído")).catch((e) => toast.error(errMsg(e)));
    load();
  };
  return (
    <div>
      <PageHeader title="Combos" subtitle="Ao vender um combo, o estoque dos componentes baixa automaticamente; o faturamento conta só o combo.">
        <Button onClick={() => setDlg({ open: true, editing: null })} className="h-11 bg-orange-600 hover:bg-orange-700" data-testid="combo-new-btn"><Plus className="mr-1 h-4 w-4" />Novo combo</Button>
      </PageHeader>
      {combos.length === 0 ? <Panel><Empty text="Nenhum combo cadastrado" /></Panel> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 stagger">
          {combos.map((c) => <ComboCard key={c.id} c={c} onEdit={() => setDlg({ open: true, editing: c })} onDelete={() => remove(c)} />)}
        </div>
      )}
      <ComboDialog open={dlg.open} editing={dlg.editing} products={products} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} onSaved={load} />
    </div>
  );
}
