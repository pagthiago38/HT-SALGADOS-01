import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Zap, ShoppingCart } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { PageHeader } from "../components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import QuickSale from "../components/vendas/QuickSale";
import CartSale from "../components/vendas/CartSale";
import SalesHistory from "../components/vendas/SalesHistory";

function buildCatalog(products, combos) {
  const p = products.map((x) => ({ key: `product:${x.id}`, type: "product", ref_id: x.id, name: x.name, price: x.price, category: x.category, stock: x.stock, unit: x.unit }));
  const c = combos.map((x) => ({
    key: `combo:${x.id}`, type: "combo", ref_id: x.id, name: x.name, price: x.price, category: "Combos", unit: "combo",
    stock: x.items.length ? Math.min(...x.items.map((i) => Math.floor(i.stock / i.qty))) : 0,
  }));
  return [...c, ...p];
}

export default function Vendas() {
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api.get("/products"), api.get("/combos")]);
      setProducts(p.data);
      setCombos(c.data);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const catalog = useMemo(() => buildCatalog(products, combos), [products, combos]);

  const sell = async (items) => {
    if (busy) return false;
    setBusy(true);
    try {
      const { data } = await api.post("/sales", { items });
      toast.success(`Venda #${data.number} registrada`, { description: `Total ${data.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` });
      load();
      setHistoryKey((k) => k + 1);
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Vendas" subtitle="Registre pelo valor total recebido. Combos baixam o estoque dos componentes sem gerar vendas duplicadas." />
      <Tabs defaultValue="cart">
        <TabsList className="mb-6 h-12 bg-white p-1">
          <TabsTrigger value="cart" className="h-10 gap-2 px-5 data-[state=active]:bg-[#0F141C] data-[state=active]:text-white" data-testid="tab-cart"><ShoppingCart className="h-4 w-4" />Carrinho</TabsTrigger>
          <TabsTrigger value="quick" className="h-10 gap-2 px-5 data-[state=active]:bg-[#0F141C] data-[state=active]:text-white" data-testid="tab-quick"><Zap className="h-4 w-4" />Venda rápida</TabsTrigger>
        </TabsList>
        <TabsContent value="cart"><CartSale catalog={catalog} onSell={sell} busy={busy} /></TabsContent>
        <TabsContent value="quick"><QuickSale catalog={catalog} onSell={sell} busy={busy} /></TabsContent>
      </Tabs>
      <SalesHistory refreshKey={historyKey} onChanged={load} />
    </div>
  );
}
