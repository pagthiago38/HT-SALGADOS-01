import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { api, errMsg } from "../lib/api";
import { brl, fmtDate, num } from "../lib/format";
import { exportCSV, exportPDF } from "../lib/export";
import { Kpi, Loading, PageHeader, Panel, PeriodFilter, usePeriod, Empty } from "../components/shared";
import { Button } from "../components/ui/button";

const RankTable = ({ title, rows, testid }) => (
  <Panel title={title} testid={testid}>
    {rows.length === 0 ? <Empty text="Sem dados no período" /> : (
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Item</th><th className="num">Qtd</th><th className="num">Faturamento</th><th className="num">Lucro bruto</th></tr></thead>
        <tbody>{rows.slice(0, 10).map((r) => (
          <tr key={r.name}><td>{r.name}</td><td className="num">{num(r.qty)}</td><td className="num">{brl(r.revenue)}</td><td className={`num ${r.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{brl(r.profit)}</td></tr>
        ))}</tbody>
      </table></div>
    )}
  </Panel>
);

function buildSections(d) {
  const dist = d.distribution;
  const rank = (title, rows) => ({ title, head: ["Item", "Qtd", "Faturamento", "Lucro bruto"], rows: rows.map((r) => [r.name, num(r.qty), brl(r.revenue), brl(r.profit)]) });
  return [
    { title: "Resumo financeiro", head: ["Indicador", "Valor"], rows: [
      ["Faturamento total", brl(d.revenue)], ["Custos (CMV)", brl(d.cmv)], ["Lucro bruto", brl(d.gross_profit)],
      ["Despesas operacionais", brl(d.op_expenses)], ["Perdas e vencidos", brl(d.losses)], ["Compras de mercadorias (caixa)", brl(d.purchases)],
      ["Resultado operacional", brl(d.op_result)], ["Pró-labore", brl(dist.pro_labore)], ["Pró-labore retirado", brl(d.pro_labore_taken)],
      ["Dízimo", brl(dist.tithe)], ["Reserva de emergência prevista", brl(dist.reserve)], ["Depósitos na reserva", brl(d.reserve_deposits)],
      ["Saldo acumulado da reserva", brl(d.reserve_balance)], ["Investimento", brl(dist.investment)], ["Lucro final", brl(dist.remaining_profit)],
      ["Quantidade de vendas", String(d.sales_count)], ["Itens vendidos", num(d.items_sold)],
    ] },
    { title: "Vendas por categoria", head: ["Categoria", "Qtd", "Faturamento"], rows: d.by_category.map((c) => [c.category, num(c.qty), brl(c.revenue)]) },
    rank("Produtos mais vendidos", d.top_products),
    rank("Combos mais vendidos", d.top_combos),
    rank("Bebidas mais vendidas", d.top_drinks),
    { title: "Despesas por categoria", head: ["Categoria", "Valor"], rows: Object.entries(d.expenses_by_category).map(([k, v]) => [k, brl(v)]) },
    { title: "Movimento diário", head: ["Data", "Faturamento", "Despesas"], rows: d.series.filter((s) => s.revenue || s.expenses).map((s) => [fmtDate(s.date), brl(s.revenue), brl(s.expenses)]) },
  ];
}

export default function Relatorios() {
  const [period, setPeriod] = usePeriod("month");
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get("/reports", { params: { start: period.start, end: period.end } }).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [period]);
  if (!d) return <Loading />;
  const dist = d.distribution;
  const label = `${fmtDate(period.start)} a ${fmtDate(period.end)}`;
  const file = `ht-salgados-relatorio-${period.start}_${period.end}`;

  return (
    <div>
      <PageHeader title="Relatórios" subtitle={`Período: ${label}`}>
        <Button variant="outline" className="h-11" onClick={() => exportCSV(`${file}.csv`, buildSections(d))} data-testid="report-export-csv-btn"><FileSpreadsheet className="mr-1 h-4 w-4" />CSV</Button>
        <Button className="h-11 bg-orange-600 hover:bg-orange-700" onClick={() => exportPDF(`${file}.pdf`, "HT Salgados - Relatório", `Período: ${label}`, buildSections(d))} data-testid="report-export-pdf-btn"><FileDown className="mr-1 h-4 w-4" />PDF</Button>
      </PageHeader>
      <div className="mb-6"><PeriodFilter value={period} onChange={setPeriod} /></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 stagger">
        <Kpi testid="report-revenue" label="Faturamento total" value={d.revenue} toneMode="pos" hint={`${d.sales_count} vendas`} />
        <Kpi testid="report-costs" label="Custos (CMV)" value={d.cmv} toneMode="neg" />
        <Kpi testid="report-expenses" label="Despesas" value={d.op_expenses + d.losses} toneMode="neg" />
        <Kpi testid="report-op-result" label="Resultado operacional" value={d.op_result} />
        <Kpi testid="report-prolabore" label="Pró-labore" value={dist.pro_labore} toneMode="amber" />
        <Kpi testid="report-tithe" label="Dízimo" value={dist.tithe} toneMode="amber" />
        <Kpi testid="report-reserve" label="Reserva de emergência" value={dist.reserve} toneMode="neutral" hint={`Saldo acumulado ${brl(d.reserve_balance)}`} />
        <Kpi testid="report-final-profit" label="Lucro final" value={dist.remaining_profit} />
      </div>
      <Panel title="Faturamento e despesas por dia" className="mt-6">
        <div className="h-64"><ResponsiveContainer>
          <BarChart data={d.series.map((s) => ({ ...s, dia: fmtDate(s.date).slice(0, 5) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1ece4" /><XAxis dataKey="dia" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={60} />
            <Tooltip formatter={(v) => brl(v)} /><Legend />
            <Bar dataKey="revenue" name="Faturamento" fill="#ea580c" radius={[4, 4, 0, 0]} /><Bar dataKey="expenses" name="Despesas" fill="#e11d48" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      </Panel>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Vendas por categoria" testid="report-by-category">
          {d.by_category.length === 0 ? <Empty text="Sem vendas" /> : d.by_category.map((c) => (
            <div key={c.category} className="wf-row"><span>{c.category} <span className="text-xs text-slate-400">({num(c.qty)})</span></span><span className="font-mono">{brl(c.revenue)}</span></div>
          ))}
        </Panel>
        <Panel title="Despesas por categoria" testid="report-expenses-category">
          {Object.keys(d.expenses_by_category).length === 0 ? <Empty text="Sem despesas" /> : Object.entries(d.expenses_by_category).map(([k, v]) => (
            <div key={k} className="wf-row"><span>{k}{k === "Mercadorias" && <span className="ml-2 text-xs text-slate-400">(compra de estoque)</span>}</span><span className="font-mono text-rose-600">{brl(v)}</span></div>
          ))}
        </Panel>
        <RankTable title="Produtos mais vendidos" rows={d.top_products} testid="report-top-products" />
        <RankTable title="Combos mais vendidos" rows={d.top_combos} testid="report-top-combos" />
        <RankTable title="Bebidas mais vendidas" rows={d.top_drinks} testid="report-top-drinks" />
      </div>
    </div>
  );
}
