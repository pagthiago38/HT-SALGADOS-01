import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Panel } from "../shared";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { brl, num, toNum } from "../../lib/format";

export default function QuickSale({ catalog, onSell, busy }) {
  const [sel, setSel] = useState("");
  const [qty, setQty] = useState("1");
  const item = catalog.find((c) => c.key === sel);
  const q = toNum(qty);
  const total = item ? item.price * q : 0;

  const finish = async () => {
    const ok = await onSell([{ type: item.type, ref_id: item.ref_id, qty: q }]);
    if (ok) {
      setQty("1");
      setSel("");
    }
  };

  return (
    <Panel className="max-w-3xl" testid="quick-sale-panel">
      <div className="grid gap-5 md:grid-cols-[1fr_180px]">
        <div>
          <Label>Produto ou combo</Label>
          <Select value={sel} onValueChange={setSel}>
            <SelectTrigger className="mt-2 h-12 text-base" data-testid="quick-product-select"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {catalog.map((c) => (
                <SelectItem key={c.key} value={c.key} data-testid={`quick-option-${c.ref_id}`}>
                  {c.type === "combo" ? "[Combo] " : ""}{c.name} — {brl(c.price)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {item && <p className="mt-2 text-xs text-slate-500">Disponível: {num(item.stock)} {item.unit}</p>}
        </div>
        <div>
          <Label>Quantidade</Label>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => setQty(String(Math.max(1, q - 1)))} data-testid="quick-qty-minus"><Minus className="h-4 w-4" /></Button>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className="h-12 text-center font-mono text-lg" data-testid="quick-qty-input" />
            <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => setQty(String(q + 1))} data-testid="quick-qty-plus"><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-[#F6F3EE] p-5">
        <div><p className="kpi-label">Preço unitário</p><p className="mt-1 font-mono text-xl font-bold" data-testid="quick-unit-price">{brl(item?.price)}</p></div>
        <div className="text-right"><p className="kpi-label">Total</p><p className="mt-1 font-mono text-3xl font-bold text-emerald-600" data-testid="quick-total">{brl(total)}</p></div>
      </div>
      <Button disabled={!item || q <= 0 || busy} onClick={finish} className="mt-5 h-14 w-full bg-orange-600 text-lg font-bold hover:bg-orange-700" data-testid="quick-finish-btn">
        {busy ? "Registrando..." : "Finalizar venda"}
      </Button>
    </Panel>
  );
}
