import { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { brl, periodRange } from "../lib/format";
import { Loader2 } from "lucide-react";

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="mb-8 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between fade-up">
    <div>
      <p className="eyebrow">HT Salgados</p>
      <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl" data-testid="page-title">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);

const TONES = { pos: "text-emerald-600", neg: "text-rose-600", neutral: "text-slate-900", amber: "text-orange-600" };

export const Kpi = ({ label, value, toneMode = "auto", hint, icon: Icon, testid, money = true }) => {
  const color = toneMode === "auto" ? (Number(value) >= 0 ? TONES.pos : TONES.neg) : TONES[toneMode];
  return (
    <div data-testid={testid} className="kpi-card">
      <div className="flex items-start justify-between gap-2">
        <p className="kpi-label">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-orange-500" strokeWidth={2.2} />}
      </div>
      <p className={`kpi-value ${color}`} data-testid={testid ? `${testid}-value` : undefined}>{money ? brl(value) : value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
};

export const Panel = ({ title, action, children, className = "", testid }) => (
  <section className={`panel ${className}`} data-testid={testid}>
    {(title || action) && (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {title && <h2 className="font-display text-base font-semibold text-slate-900 md:text-lg">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);

export const Loading = () => (
  <div className="flex h-64 items-center justify-center text-slate-400" data-testid="loading">
    <Loader2 className="h-6 w-6 animate-spin" />
  </div>
);

export const Empty = ({ text }) => <p className="py-8 text-center text-sm text-slate-400">{text}</p>;

export function usePeriod(kind = "month") {
  return useState(() => ({ kind, ...periodRange(kind) }));
}

const PRESETS = [["day", "Hoje"], ["week", "Semana"], ["month", "Mês"]];

export const PeriodFilter = ({ value, onChange }) => (
  <div className="flex flex-wrap items-center gap-2" data-testid="period-filter">
    <div className="seg-group">
      {PRESETS.map(([k, l]) => (
        <button key={k} type="button" data-testid={`period-${k}-btn`} onClick={() => onChange({ kind: k, ...periodRange(k) })} className={`seg ${value.kind === k ? "seg-active" : ""}`}>
          {l}
        </button>
      ))}
    </div>
    <Input type="date" value={value.start} onChange={(e) => onChange({ ...value, kind: "custom", start: e.target.value })} className="h-10 w-[140px] bg-white" data-testid="period-start-input" />
    <span className="text-xs text-slate-400">até</span>
    <Input type="date" value={value.end} onChange={(e) => onChange({ ...value, kind: "custom", end: e.target.value })} className="h-10 w-[140px] bg-white" data-testid="period-end-input" />
  </div>
);

export function ReasonDialog({ open, onOpenChange, title, description, onConfirm }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const ok = await onConfirm(reason.trim());
    setBusy(false);
    if (ok !== false) {
      setReason("");
      onOpenChange(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="reason-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description || "O lançamento fica no histórico como cancelado. Informe o motivo."}</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo da correção" data-testid="reason-input" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="reason-cancel-btn">Voltar</Button>
          <Button variant="destructive" disabled={!reason.trim() || busy} onClick={submit} data-testid="reason-confirm-btn">Confirmar cancelamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Money = ({ v, className = "" }) => <span className={`font-mono tabular-nums ${className}`}>{brl(v)}</span>;

export const StatusBadge = ({ status }) => {
  const ok = status === "ativo" || status === "ativa";
  return <span className={`badge ${ok ? "badge-ok" : "badge-off"}`}>{ok ? "Ativo" : "Cancelado"}</span>;
};
