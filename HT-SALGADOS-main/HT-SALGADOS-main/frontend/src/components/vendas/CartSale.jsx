import { useMemo, useState } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { Panel, Empty } from "../shared";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { brl, num } from "../../lib/format";

const CartLine = ({ line, onQty, onRemove }) => (
  <div className="flex items-center gap-2 border-b border-dashed border-slate-100 py-3" data-testid={`cart-line-${line.ref_id}`}>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold">{line.name}</p>
      <p className="font-mono text-xs text-slate-500">{brl(line.price)} un.</p>
    </div>
    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onQty(line.qty - 1)} data-testid={`cart-minus-${line.ref_id}`}><Minus className="h-3.5 w-3.5" /></Button>
    <span className="w-8 text-center font-mono font-bold" data-testid={`cart-qty-${line.ref_id}`}>{num(line.qty)}</span>
    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onQty(line.qty + 1)} data-testid={`cart-plus-${line.ref_id}`}><Plus className="h-3.5 w-3.5" /></Button>
    <span className="w-20 text-right font-mono text-sm font-semibold">{brl(line.price * line.qty)}</span>
    <button onClick={onRemove} className="p-1 text-rose-500" data-testid={`cart-remove-${line.ref_id}`} aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
  </div>
);

export default function CartSale({ catalog, onSell, busy }) {
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("Todos");
  const cats = useMemo(() => ["Todos", ...new Set(catalog.map((c) => c.category))], [catalog]);
  const shown = catalog.filter((c) => (cat === "Todos" || c.category === cat) && c.name.toLowerCase().includes(search.toLowerCase()));

  const add = (item) => setCart((cs) => {
    const ex = cs.find((l) => l.key === item.key);
    return ex ? cs.map((l) => (l.key === item.key ? { ...l, qty: l.qty + 1 } : l)) : [...cs, { ...item, qty: 1 }];
  });
  const setQty = (key, qty) => setCart((cs) => (qty <= 0 ? cs.filter((l) => l.key !== key) : cs.map((l) => (l.key === key ? { ...l, qty } : l))));
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  const finish = async () => {
    const ok = await onSell(cart.map((l) => ({ type: l.type, ref_id: l.ref_id, qty: l.qty })));
    if (ok) setCart([]);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-7 xl:col-span-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto ou combo" className="h-10 bg-white pl-9" data-testid="cart-search-input" />
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`seg border border-slate-200 ${cat === c ? "seg-active" : "bg-white"}`} data-testid={`cart-cat-${c}`}>{c}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((c) => (
            <button key={c.key} className="tile" onClick={() => add(c)} data-testid={`tile-${c.ref_id}`}>
              <span className={`badge ${c.type === "combo" ? "badge-warn" : "badge-muted"}`}>{c.category}</span>
              <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{c.name}</p>
              <div className="mt-2 flex items-end justify-between">
                <span className="font-mono font-bold text-orange-600">{brl(c.price)}</span>
                <span className={`text-[11px] ${c.stock <= 0 ? "text-rose-500" : "text-slate-400"}`}>{num(c.stock)}</span>
              </div>
            </button>
          ))}
        </div>
        {shown.length === 0 && <Empty text="Nenhum item encontrado" />}
      </div>
      <div className="min-w-0 lg:col-span-5 xl:col-span-4">
        <Panel title={`Carrinho (${num(count)})`} className="lg:sticky lg:top-6" testid="cart-panel"
          action={cart.length > 0 && <button className="text-xs font-semibold text-rose-500" onClick={() => setCart([])} data-testid="cart-clear-btn">Limpar</button>}>
          {cart.length === 0 ? <Empty text="Toque nos produtos para adicionar" /> : cart.map((l) => (
            <CartLine key={l.key} line={l} onQty={(q) => setQty(l.key, q)} onRemove={() => setQty(l.key, 0)} />
          ))}
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-mono" data-testid="cart-subtotal">{brl(subtotal)}</span></div>
            <div className="flex items-end justify-between pt-2"><span className="font-semibold">Total recebido</span><span className="font-mono text-3xl font-bold text-emerald-600" data-testid="cart-total">{brl(subtotal)}</span></div>
          </div>
          <Button disabled={!cart.length || busy} onClick={finish} className="mt-5 h-14 w-full bg-orange-600 text-lg font-bold hover:bg-orange-700" data-testid="cart-finish-btn">
            {busy ? "Registrando..." : "Finalizar venda"}
          </Button>
        </Panel>
      </div>
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-[60px] z-30 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-8px_20px_-12px_rgba(0,0,0,.25)] lg:hidden" data-testid="cart-mobile-bar">
          <div><p className="text-xs text-slate-500">{num(count)} itens</p><p className="font-mono text-xl font-bold text-emerald-600">{brl(subtotal)}</p></div>
          <Button disabled={busy} onClick={finish} className="h-12 bg-orange-600 px-6 font-bold hover:bg-orange-700" data-testid="cart-mobile-finish-btn">{busy ? "..." : "Finalizar"}</Button>
        </div>
      )}
    </div>
  );
}
