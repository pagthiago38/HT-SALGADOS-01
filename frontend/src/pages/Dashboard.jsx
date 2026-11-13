import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { TrendingUp, CalendarDays, ShoppingBag, Package, Receipt, Boxes, Scale, HandCoins, PiggyBank, Wallet, AlertTriangle } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { brl, num, fmtTime } from "../lib/format";
import { Kpi, Loading, PageHeader, Panel, Empty } from "../components/shared";
import { Button } from "../components/ui/button";

const COLORS = ["#ea580c", "#0f141c", "#f59e0b", "#10b981", "#64748b", "#e11d48"];

const Charts = ({ d }) => (
  <div className="mt-6 grid gap-6 xl:grid-cols-3">
    <Panel title="Faturamento x despesas no mês" className="xl:col-span-2" testid="chart-revenue">
      <div className="h-72">
        <ResponsiveContainer>
          <AreaChart data={d.series.map((s) => ({ ...s, dia: s.date.slice(8) }))}>
            <defs>
              <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ea580c" stopOpacity={0.35} /><stop offset="100%" stopColor="#ea580c" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1ece4" />
            <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={(v) => `R$${v}`} />
            <Tooltip formatter={(v) => brl(v)} />
            <Legend />
            <Area type="monotone" dataKey="revenue" name="Faturamento" stroke="#ea580c" fill="url(#gRev)" strokeWidth={2} />
            <Area type="monotone" dataKey="expenses" name="Despesas" stroke="#e11d48" fill="transparent" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
    <Panel title="Despesas por categoria" testid="chart-expenses">
      {d.expenses_by_category.length === 0 ? <Empty text="Nenhuma despesa no mês" /> : (
        <div className="h-72">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={d.expenses_by_category} dataKey="amount" nameKey="category" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {d.expenses_by_category.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => brl(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
    <Panel title="Desempenho dos produtos (mês)" className="xl:col-span-2" testid="chart-products">
      {d.top_products.length === 0 ? <Empty text="Nenhuma venda no mês ainda" /> : (
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={d.top_products} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1ece4" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, n) => (n === "Faturamento" ? brl(v) : num(v))} />
              <Bar dataKey="qty" name="Quantidade" fill="#ea580c" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
    <Side d={d} />
  </div>
);

const Side = ({ d }) => (
  <div className="flex flex-col gap-6">
    <Panel title="Estoque baixo" testid="low-stock-panel">
      {d.low_stock.length === 0 ? <Empty text="Tudo em ordem" /> : d.low_stock.slice(0, 6).map((p) => (
        <div key={p.id} className="flex items-center justify-between border-b border-dashed border-slate-100 py-2 text-sm">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" />{p.name}</span>
          <span className="badge badge-warn">{num(p.stock)} {p.unit}</span>
        </div>
      ))}
    </Panel>
    <Panel title="Últimas vendas" testid="recent-sales-panel">
      {d.recent_sales.length === 0 ? <Empty text="Nenhuma venda registrada" /> : d.recent_sales.map((s) => (
        <div key={s.id} className="flex items-center justify-between py-1.5 text-sm">
          <span className="text-slate-500">#{s.number} · {fmtTime(s.created_at)}</span>
          <span className="font-mono font-semibold text-emerald-600">{brl(s.total)}</span>
        </div>
      ))}
    </Panel>
  </div>
);

export default function Dashboard() {
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get("/dashboard").then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e)));
  }, []);
  if (!d) return <Loading />;
  const m = d.month;
  const dist = m.distribution;
  return (
    <div>
      <PageHeader title="Visão geral" subtitle="Resumo automático do dia e do mês corrente.">
        <Button asChild className="h-11 bg-orange-600 px-6 text-base hover:bg-orange-700" data-testid="dashboard-new-sale-btn"><Link to="/vendas">Nova venda</Link></Button>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5 stagger">
        <Kpi testid="kpi-faturamento-dia" label="Faturamento do dia" value={d.today.revenue} toneMode="pos" icon={TrendingUp} hint={`${d.today.sales_count} vendas hoje`} />
        <Kpi testid="kpi-faturamento-mes" label="Faturamento do mês" value={m.revenue} toneMode="pos" icon={CalendarDays} />
        <Kpi testid="kpi-qtd-vendas" label="Vendas no mês" value={m.sales_count} money={false} toneMode="neutral" icon={ShoppingBag} hint={`Ticket médio ${brl(m.avg_ticket)}`} />
        <Kpi testid="kpi-qtd-produtos" label="Itens vendidos no mês" value={num(m.items_sold)} money={false} toneMode="neutral" icon={Package} />
        <Kpi testid="kpi-despesas-mes" label="Despesas do mês" value={m.op_expenses} toneMode="neg" icon={Receipt} hint="Operacionais (sem mercadorias)" />
        <Kpi testid="kpi-cmv" label="Custo mercad. vendidas" value={m.cmv} toneMode="neg" icon={Boxes} />
        <Kpi testid="kpi-resultado" label="Resultado operacional" value={m.op_result} icon={Scale} />
        <Kpi testid="kpi-prolabore" label="Pró-labore previsto" value={dist.pro_labore} toneMode="amber" icon={HandCoins} hint={`Retirado: ${brl(d.pro_labore_taken)}`} />
        <Kpi testid="kpi-lucro" label="Lucro restante" value={dist.remaining_profit} icon={PiggyBank} />
        <Kpi testid="kpi-caixa" label="Saldo em caixa" value={d.balances.cash} icon={Wallet} />
      </div>
      <Charts d={d} />
    </div>
  );
}
