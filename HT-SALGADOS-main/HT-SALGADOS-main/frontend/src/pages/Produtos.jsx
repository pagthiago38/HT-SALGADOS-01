import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { brl, num, pct, toNum, PRODUCT_CATEGORIES, UNITS } from "../lib/format";
import { PageHeader, Panel, Empty } from "../components/shared";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { CostFields, CostSummary, costsToBody, costsToForm } from "../components/CostComposer";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";

const EMPTY = { name: "", category: "Salgados", cost: "", price: "", unit: "un", min_stock: "5", initial_stock: "0", ...costsToForm() };

function ProductDialog({ open, onOpenChange, editing, onSaved }) {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(editing ? { ...editing, cost: String(editing.cost), price: String(editing.price), min_stock: String(editing.min_stock), initial_stock: "0", ...costsToForm(editing) } : EMPTY);
  }, [open, editing]);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const cost = toNum(f.cost);
  const price = toNum(f.price);

  const save = async () => {
    setBusy(true);
    const body = { name: f.name.trim(), category: f.category, cost, price, unit: f.unit, min_stock: toNum(f.min_stock), initial_stock: editing ? 0 : toNum(f.initial_stock), ...costsToBody(f) };
    try {
      if (editing) await api.put(`/products/${editing.id}`, body);
      else await api.post("/products", body);
      toast.success(editing ? "Produto atualizado" : "Produto cadastrado");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto" data-testid="product-dialog">
        <DialogHeader><DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Nome</Label><Input className="mt-1" value={f.name} onChange={set("name")} data-testid="product-name-input" /></div>
          <div><Label>Categoria</Label>
            <Select value={f.category} onValueChange={set("category")}><SelectTrigger className="mt-1" data-testid="product-category-select"><SelectValue /></SelectTrigger>
              <SelectContent>{PRODUCT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>Unidade</Label>
            <Select value={f.unit} onValueChange={set("unit")}><SelectTrigger className="mt-1" data-testid="product-unit-select"><SelectValue /></SelectTrigger>
              <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>Preço de custo (R$)</Label><Input className="mt-1" inputMode="decimal" value={f.cost} onChange={set("cost")} data-testid="product-cost-input" /></div>
          <div><Label>Preço de venda (R$)</Label><Input className="mt-1" inputMode="decimal" value={f.price} onChange={set("price")} data-testid="product-price-input" /></div>
          <div><Label>Estoque mínimo</Label><Input className="mt-1" inputMode="decimal" value={f.min_stock} onChange={set("min_stock")} data-testid="product-min-stock-input" /></div>
          {editing ? (
            <div><Label>Estoque atual</Label><p className="mt-3 text-sm text-slate-500">{num(editing.stock)} {editing.unit} · altere pelo Estoque</p></div>
          ) : (
            <div><Label>Estoque inicial</Label><Input className="mt-1" inputMode="decimal" value={f.initial_stock} onChange={set("initial_stock")} data-testid="product-initial-stock-input" /></div>
          )}
        </div>
        <CostFields f={f} setF={setF} prefix="product" />
        <CostSummary base={cost} price={price} f={f} prefix="product" onUseSuggested={(v) => setF({ ...f, price: v })} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!f.name.trim() || busy} onClick={save} className="bg-orange-600 hover:bg-orange-700" data-testid="product-save-btn">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Produtos() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("Todas");
  const [dlg, setDlg] = useState({ open: false, editing: null });
  const [del, setDel] = useState(null);
  const load = useCallback(() => api.get("/products").then((r) => setRows(r.data)).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    try {
      await api.delete(`/products/${del.id}`);
      toast.success("Produto excluído (histórico preservado)");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setDel(null);
  };
  const shown = rows.filter((p) => (cat === "Todas" || p.category === cat) && p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader title="Produtos" subtitle="Salgados, bebidas, sucos, refrigerantes, industrializados e outros.">
        <Button onClick={() => setDlg({ open: true, editing: null })} className="h-11 bg-orange-600 hover:bg-orange-700" data-testid="product-new-btn"><Plus className="mr-1 h-4 w-4" />Novo produto</Button>
      </PageHeader>
      <Panel>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative md:w-72"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" className="pl-9" data-testid="product-search-input" /></div>
          <div className="flex flex-wrap gap-2">
            {["Todas", ...PRODUCT_CATEGORIES].map((c) => <button key={c} onClick={() => setCat(c)} className={`seg border border-slate-200 ${cat === c ? "seg-active" : ""}`} data-testid={`product-filter-${c}`}>{c}</button>)}
          </div>
        </div>
        {shown.length === 0 ? <Empty text="Nenhum produto" /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Produto</th><th>Categoria</th><th className="num">Custo merc.</th><th className="num">Custo total</th><th className="num">Venda</th><th className="num">Sugerido</th><th className="num">Margem contrib.</th><th className="num">Margem venda</th><th className="num">Estoque</th><th>Un.</th><th /></tr></thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} data-testid={`product-row-${p.id}`}>
                    <td className="font-semibold">{p.name}</td>
                    <td><span className="badge badge-muted">{p.category}</span></td>
                    <td className="num text-rose-600">{brl(p.cost)}</td>
                    <td className="num text-rose-600">{brl(p.unit_cost_total)}</td>
                    <td className="num font-semibold">{brl(p.price)}</td>
                    <td className="num text-orange-600">{p.suggested_price === null ? "—" : brl(p.suggested_price)}</td>
                    <td className={`num ${p.contribution_margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{brl(p.contribution)} · {pct(p.contribution_margin)}</td>
                    <td className={`num ${p.sales_margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{pct(p.sales_margin)}</td>
                    <td className="num"><span className={p.low_stock ? "badge badge-warn" : ""}>{num(p.stock)}</span></td>
                    <td>{p.unit}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="icon" variant="ghost" onClick={() => setDlg({ open: true, editing: p })} data-testid={`product-edit-${p.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-rose-600" onClick={() => setDel(p)} data-testid={`product-delete-${p.id}`}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <ProductDialog open={dlg.open} editing={dlg.editing} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} onSaved={load} />
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir {del?.name}?</AlertDialogTitle>
            <AlertDialogDescription>O produto sai do cadastro, mas as vendas e movimentações antigas continuam no histórico.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction onClick={remove} className="bg-rose-600 hover:bg-rose-700" data-testid="product-delete-confirm">Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
