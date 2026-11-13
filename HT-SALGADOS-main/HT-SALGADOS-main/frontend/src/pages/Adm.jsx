import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, HandCoins, Heart, PiggyBank, TrendingUp, Save } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { brl, pct, toNum } from "../lib/format";
import { distribute } from "../lib/finance";
import { Kpi, Loading, PageHeader, Panel, PeriodFilter, usePeriod } from "../components/shared";
import { Button } from "../components/ui/button";
import MovementDialog from "../components/MovementDialog";
import DistributionConfig from "../components/adm/DistributionConfig";

const Row = ({ label, value, sign = "", total, testid, muted }) => (
  <div className={`wf-row ${total ? "wf-total" : ""} ${muted ? "text-slate-500" : ""}`} data-testid={testid}>
    <span>{sign && <span className="mr-2 font-mono text-slate-400">{sign}</span>}{label}</span>
    <span className={`font-mono ${total ? (value >= 0 ? "text-emerald-600" : "text-rose-600") : ""}`}>{brl(value)}</span>
  </div>
);

const Waterfall = ({ d, dist }) => (
  <Panel title="Demonstração do resultado" testid="adm-waterfall">
    <Row label="Faturamento bruto" value={d.revenue} />
    <Row sign="−" label="Custo dos produtos vendidos (CMV)" value={d.cmv} />
    <Row label="Lucro bruto" value={d.gross_profit} total />
    <Row sign="−" label="Despesas operacionais" value={d.op_expenses} />
    <Row sign="−" label="Perdas e vencidos (a custo)" value={d.losses} />
    <Row label="Resultado operacional" value={d.op_result} total testid="adm-wf-op-result" />
    <Row sign="−" label="Pró-labore" value={dist.pro_labore} />
    <Row label={`  dentro dele: dízimo (${pct(dist.tithe ? (dist.tithe / dist.pro_labore) * 100 : 0)})`} value={dist.tithe} muted />
    <Row sign="−" label="Reserva de emergência" value={dist.reserve} />
    <Row sign="−" label="Investimento" value={dist.investment} />
    <Row label="Lucro que permanece no negócio" value={dist.remaining_profit} total testid="adm-wf-remaining" />
    <p className="mt-3 text-xs text-slate-400">Compras de mercadorias ({brl(d.purchases)}) saem do caixa, mas não são descontadas aqui: o custo entra pelo CMV.</p>
  </Panel>
);

const Box = ({ title, icon: Icon, children, action, testid }) => (
  <Panel testid={testid} title={<span className="flex items-center gap-2"><Icon className="h-5 w-5 text-orange-500" />{title}</span>} action={action}>
    <div className="space-y-0">{children}</div>
  </Panel>
);
const Line = ({ label, v, cls = "", testid }) => (
  <div className="wf-row"><span>{label}</span><span className={`font-mono font-semibold ${cls}`} data-testid={testid}>{brl(v)}</span></div>
);

export default function Adm() {
  const [period, setPeriod] = usePeriod("month");
  const [d, setD] = useState(null);
  const [draft, setDraft] = useState(null);
  const [mv, setMv] = useState({ open: false, type: "prolabore" });
  const load = useCallback(() => api.get("/adm", { params: { start: period.start, end: period.end } }).then((r) => {
    setD(r.data);
    setDraft((x) => x || r.data.settings);
  }).catch((e) => toast.error(errMsg(e))), [period]);
  useEffect(() => {
    load();
  }, [load]);
  const dist = useMemo(() => (d && draft ? distribute(draft, d.revenue, d.gross_profit, d.op_result, d.expenses_by_category) : null), [d, draft]);
  const dirty = d && draft && JSON.stringify(draft) !== JSON.stringify(d.settings);

  const saveSettings = async () => {
    try {
      const clamp = (v) => Math.min(100, Math.max(0, toNum(v)));
      const body = { ...draft, tithe_pct: clamp(draft.tithe_pct), distribution: draft.distribution.map((x) => ({ ...x, pct: clamp(x.pct) })) };
      const { data } = await api.put("/settings", body);
      setDraft(data);
      toast.success("Percentuais salvos");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  if (!d || !dist) return <Loading />;
  const b = d.balances;
  const plAvail = dist.pro_labore - d.pro_labore_taken;
  const openMv = (type) => setMv({ open: true, type });

  return (
    <div>
      <PageHeader title="Administração geral" subtitle="A saúde financeira da HT Salgados no período: quanto vendeu, gastou, pode retirar, deve separar e quanto ficou de lucro.">
        <PeriodFilter value={period} onChange={setPeriod} />
      </PageHeader>
      {!dist.allowed && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" data-testid="adm-blocked-alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />Resultado operacional não é positivo: nenhuma distribuição (pró-labore, reserva, investimento) é permitida neste período.
        </div>
      )}
      {dist.over_distributed && (
        <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800" data-testid="adm-over-alert">As destinações configuradas somam mais que o resultado operacional. Revise os percentuais ou as bases.</div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 stagger">
        <Kpi testid="adm-revenue" label="Faturamento bruto" value={d.revenue} toneMode="pos" />
        <Kpi testid="adm-cmv" label="Custos dos produtos vendidos" value={d.cmv} toneMode="neg" />
        <Kpi testid="adm-op-expenses" label="Despesas operacionais" value={d.op_expenses + d.losses} toneMode="neg" hint={d.losses ? `Inclui perdas ${brl(d.losses)}` : undefined} />
        <Kpi testid="adm-op-result" label="Resultado operacional" value={d.op_result} />
        <Kpi testid="adm-prolabore" label="Pró-labore" value={dist.pro_labore} toneMode="amber" />
        <Kpi testid="adm-tithe" label="Dízimo do pró-labore" value={dist.tithe} toneMode="amber" />
        <Kpi testid="adm-reserve" label="Reserva de emergência" value={dist.reserve} toneMode="neutral" />
        <Kpi testid="adm-investment" label="Investimento" value={dist.investment} toneMode="neutral" />
        <Kpi testid="adm-remaining" label="Lucro líquido restante" value={dist.remaining_profit} />
        <Kpi testid="adm-reserve-balance" label="Saldo acumulado da reserva" value={b.reserve} toneMode="neutral" />
        <Kpi testid="adm-cash" label="Saldo disponível no caixa" value={b.cash} />
        <Kpi testid="adm-investment-balance" label="Saldo investido" value={b.investment} toneMode="neutral" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Waterfall d={d} dist={dist} />
        <DistributionConfig draft={draft} setDraft={setDraft} dist={dist} />
      </div>
      {dirty && (
        <div className="sticky bottom-20 z-20 mt-4 flex items-center justify-between rounded-2xl bg-[#0F141C] p-4 text-white lg:bottom-4">
          <span className="text-sm">Prévia com novos percentuais. Salve para aplicar.</span>
          <div className="flex gap-2">
            <Button variant="ghost" className="text-white" onClick={() => setDraft(d.settings)} data-testid="adm-discard-btn">Descartar</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={saveSettings} data-testid="adm-save-settings-btn"><Save className="mr-1 h-4 w-4" />Salvar</Button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Box title="Pró-labore" icon={HandCoins} testid="adm-prolabore-box" action={<Button size="sm" variant="outline" disabled={!dist.allowed} onClick={() => openMv("prolabore")} data-testid="adm-prolabore-withdraw-btn">Retirar</Button>}>
          <Line label="Previsto" v={dist.pro_labore} />
          <Line label="Retirado" v={d.pro_labore_taken} cls="text-rose-600" testid="adm-prolabore-taken" />
          <Line label="Disponível p/ retirada" v={plAvail} cls={plAvail >= 0 ? "text-emerald-600" : "text-rose-600"} testid="adm-prolabore-available" />
        </Box>
        <Box title={`Dízimo (${pct(toNum(draft.tithe_pct))})`} icon={Heart} testid="adm-tithe-box">
          <Line label="Pró-labore" v={dist.pro_labore} />
          <Line label="Dízimo" v={dist.tithe} cls="text-orange-600" testid="adm-tithe-value" />
          <Line label="Valor restante" v={dist.pro_labore_net} cls="text-emerald-600" testid="adm-tithe-remaining" />
          <p className="pt-2 text-xs text-slate-400">Destinação pessoal do pró-labore, não despesa da empresa.</p>
        </Box>
        <Box title="Reserva de emergência" icon={PiggyBank} testid="adm-reserve-box" action={<div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => openMv("reserva_deposito")} data-testid="adm-reserve-deposit-btn">Depositar</Button>
          <Button size="sm" variant="ghost" onClick={() => openMv("reserva_retirada")} data-testid="adm-reserve-withdraw-btn">Retirar</Button></div>}>
          <div className="wf-row"><span>Percentual destinado</span><span className="font-mono font-semibold">{pct(toNum(draft.distribution.find((x) => x.key === "reserva")?.pct))}</span></div>
          <Line label="Valor previsto" v={dist.reserve} />
          <Line label="Depósitos no período" v={d.reserve_deposits} cls="text-emerald-600" />
          <Line label="Retiradas no período" v={d.reserve_withdrawals} cls="text-rose-600" />
          <Line label="Saldo acumulado" v={b.reserve} cls="text-slate-900" testid="adm-reserve-accumulated" />
        </Box>
        <Box title="Investimento" icon={TrendingUp} testid="adm-investment-box" action={<Button size="sm" variant="outline" onClick={() => openMv("investimento")} data-testid="adm-invest-btn">Transferir</Button>}>
          <Line label="Previsto" v={dist.investment} />
          <Line label="Transferido no período" v={d.investment_done} />
          <Line label="Saldo investido" v={b.investment} cls="text-slate-900" />
        </Box>
      </div>
      <MovementDialog open={mv.open} presetType={mv.type} onOpenChange={(o) => setMv((x) => ({ ...x, open: o }))} onSaved={load} />
    </div>
  );
}
