import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { toNum, today, MOVEMENT_LABELS } from "../lib/format";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

export default function MovementDialog({ open, onOpenChange, presetType = "prolabore", editing, onSaved }) {
  const [f, setF] = useState({});
  useEffect(() => {
    if (open) setF(editing ? { ...editing, amount: String(editing.amount) } : { type: presetType, amount: "", date: today(), note: "" });
  }, [open, editing, presetType]);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const save = async () => {
    const body = { type: f.type, amount: toNum(f.amount), date: f.date, note: f.note || "" };
    try {
      if (editing) await api.put(`/movements/${editing.id}`, body);
      else await api.post("/movements", body);
      toast.success(editing ? "Lançamento corrigido (versão anterior guardada)" : "Lançamento registrado");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="movement-dialog">
        <DialogHeader><DialogTitle>{editing ? "Corrigir lançamento" : "Novo lançamento financeiro"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Tipo</Label>
            <Select value={f.type} onValueChange={set("type")}><SelectTrigger className="mt-1" data-testid="movement-type-select"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(MOVEMENT_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>Valor (R$)</Label><Input className="mt-1" inputMode="decimal" value={f.amount || ""} onChange={set("amount")} data-testid="movement-amount-input" /></div>
          <div><Label>Data</Label><Input type="date" className="mt-1" value={f.date || ""} onChange={set("date")} data-testid="movement-date-input" /></div>
          <div className="col-span-2"><Label>Observação</Label><Textarea className="mt-1" value={f.note || ""} onChange={set("note")} data-testid="movement-note-input" /></div>
        </div>
        <p className="text-xs text-slate-500">Retiradas, reserva e investimentos movimentam o caixa, mas não são despesas operacionais.</p>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={toNum(f.amount) <= 0} onClick={save} className="bg-orange-600 hover:bg-orange-700" data-testid="movement-save-btn">Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
