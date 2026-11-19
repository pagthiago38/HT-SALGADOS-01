import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Upload, History, ShieldCheck, Trash2 } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { fmtDateTime, toNum } from "../lib/format";
import { downloadFile } from "../lib/export";
import { PageHeader, Panel, Empty } from "../components/shared";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";

function SettingsForm() {
  const [s, setS] = useState(null);
  useEffect(() => {
    api.get("/settings").then((r) => setS(r.data));
  }, []);
  if (!s) return null;
  const save = async () => {
    try {
      const { data } = await api.put("/settings", { ...s, opening_cash: toNum(s.opening_cash), default_min_stock: toNum(s.default_min_stock) });
      setS(data);
      toast.success("Configurações salvas");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <Panel title="Configurações" testid="settings-panel">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label>Nome do estabelecimento</Label><Input className="mt-1" value={s.company_name} onChange={(e) => setS({ ...s, company_name: e.target.value })} data-testid="settings-company-input" /></div>
        <div><Label>Saldo inicial do caixa (R$)</Label><Input className="mt-1" inputMode="decimal" value={s.opening_cash} onChange={(e) => setS({ ...s, opening_cash: e.target.value })} data-testid="settings-opening-cash-input" /></div>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm"><Switch checked={s.allow_negative_stock} onCheckedChange={(v) => setS({ ...s, allow_negative_stock: v })} data-testid="settings-negative-stock-switch" />Permitir vender sem estoque suficiente</label>
      <Button onClick={save} className="mt-4 bg-orange-600 hover:bg-orange-700" data-testid="settings-save-btn">Salvar configurações</Button>
    </Panel>
  );
}

export default function Backup() {
  const [snaps, setSnaps] = useState([]);
  const [storage, setStorage] = useState(null);
const [loadingStorage, setLoadingStorage] = useState(false);
  const [audit, setAudit] = useState([]);
  const [confirm, setConfirm] = useState("");
  const fileRef = useRef(null);
  const load = useCallback(async () => {
    const [s, a] = await Promise.all([api.get("/backup/snapshots"), api.get("/audit", { params: { limit: 30 } })]);
    setSnaps(s.data);
    setAudit(a.data);
  }, []);
  
const loadStorage = useCallback(async () => {
  setLoadingStorage(true);
  try {
    const response = await api.get("/storage");
    setStorage(response.data);
  } catch (error) {
    toast.error("Não foi possível consultar o armazenamento");
  } finally {
    setLoadingStorage(false);
  }
}, []);

  useEffect(() => {
    load().catch((e) => toast.error(errMsg(e)));
  }, [load]);
useEffect(() => {
  loadStorage();
}, [loadStorage]);
  const exportJSON = async () => {
    const { data } = await api.get("/backup");
    downloadFile(`ht-salgados-backup-${data.exported_at.slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
    toast.success("Backup completo baixado");
  };
  const restoreFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm("Restaurar este backup vai substituir todos os dados atuais. Um ponto de restauração será criado antes. Continuar?")) return;
    try {
      await api.post("/backup/restore", JSON.parse(await file.text()));
      toast.success("Backup restaurado");
      load();
    } catch (err) {
      toast.error(err instanceof SyntaxError ? "Arquivo inválido" : errMsg(err));
    }
  };
  const restoreSnap = async (id) => {
    if (!window.confirm("Voltar os dados para este ponto? Um novo ponto será criado antes.")) return;
    await api.post(`/backup/snapshots/${id}/restore`).then(() => toast.success("Dados restaurados")).catch((e) => toast.error(errMsg(e)));
    load();
  };
  const snapshot = async () => {
    await api.post("/backup/snapshots");
    toast.success("Ponto de restauração criado");
    load();
  };
  
const deleteSnap = async (id) => {
  if (!window.confirm("Tem certeza que deseja excluir este backup? Essa ação não pode ser desfeita.")) return;

  try {
    await api.delete(`/backup/snapshots/${id}`);
    toast.success("Backup excluído com sucesso");
    await load();
  } catch (e) {
    toast.error(errMsg(e));
  }
};

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(2)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

  const reset = async () => {
    await api.post("/backup/reset", { confirm }).then(() => toast.success("Dados apagados (ponto de restauração criado)")).catch((e) => toast.error(errMsg(e)));
    setConfirm("");
    load();
  };

const latestAutomaticId = [...snaps]
  .filter((s) => s.reason === "Automático diário")
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]?.id;

  return (
    <div>
      <PageHeader title="Backup e configurações" subtitle="Tudo é salvo automaticamente no banco central, acessível do computador e do celular." />
      <div className="grid gap-6 xl:grid-cols-2">
        
<Panel title="Armazenamento do banco" testid="storage-panel">
  {loadingStorage ? (
    <p className="text-sm text-slate-500">Consultando armazenamento...</p>
  ) : storage ? (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Banco de dados</p>
          <p className="text-xl font-bold">{formatBytes(storage.database_bytes)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Tabela de registros</p>
          <p className="text-xl font-bold">{formatBytes(storage.table_bytes)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Seus dados (estimativa)</p>
          <p className="text-xl font-bold">{formatBytes(storage.user_data_bytes)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Quantidade de registros</p>
          <p className="text-xl font-bold">{storage.user_records ?? 0}</p>
        </div>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-sm font-semibold">Detalhamento por coleção</p>
        {Object.entries(storage.collections || {}).map(([name, info]) => (
          <div key={name} className="flex justify-between border-b border-dashed py-2 text-sm">
            <span>{name}</span>
            <span className="text-slate-500">
              {info.count} registros · {formatBytes(info.bytes)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        O tamanho do banco e da tabela é físico. O tamanho dos seus dados é uma estimativa.
      </p>
    </>
  ) : (
    <p className="text-sm text-slate-500">Não foi possível carregar os dados de armazenamento.</p>
  )}
</Panel>

        <Panel title="Backup completo" testid="backup-panel">
          <p className="mb-4 text-sm text-slate-500">Baixe um arquivo JSON com todos os dados ou restaure um arquivo salvo anteriormente.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportJSON} className="h-11 bg-orange-600 hover:bg-orange-700" data-testid="backup-export-btn"><Download className="mr-1 h-4 w-4" />Baixar backup JSON</Button>
            <Button variant="outline" className="h-11" onClick={() => fileRef.current?.click()} data-testid="backup-restore-btn"><Upload className="mr-1 h-4 w-4" />Restaurar arquivo</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={restoreFile} data-testid="backup-file-input" />
          </div>
          <div className="mt-6 flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />Proteção: um ponto de restauração é criado automaticamente todo dia e antes de qualquer restauração ou limpeza (últimos 30 guardados).
          </div>
        </Panel>
        <SettingsForm />
        <Panel title="Pontos de restauração" testid="snapshots-panel" action={<Button size="sm" variant="outline" onClick={snapshot} data-testid="snapshot-create-btn">Criar agora</Button>}>
          {snaps.length === 0 ? <Empty text="Nenhum ponto ainda" /> : snaps.map((s) => (
            <div key={s.id} className="flex items-center justify-between border-b border-dashed border-slate-100 py-2 text-sm">
              <div><p className="font-semibold">{s.reason}</p><p className="text-xs text-slate-500">{fmtDateTime(s.created_at)} · {s.counts?.sales || 0} vendas · {s.counts?.products || 0} produtos</p></div>
               <div className="flex gap-1">   <Button size="sm" variant="ghost" onClick={() => restoreSnap(s.id)} data-testid={`snapshot-restore-${s.id}`}>     <History className="mr-1 h-3.5 w-3.5" />Restaurar   </Button>   {s.id !== latestAutomaticId && (     <Button size="sm" variant="ghost" onClick={() => deleteSnap(s.id)} data-testid={`snapshot-delete-${s.id}`}>       <Trash2 className="mr-1 h-3.5 w-3.5" />Excluir     </Button>   )} </div>
            </div>
          ))}
        </Panel>
        <Panel title="Histórico de alterações" testid="audit-panel">
          {audit.length === 0 ? <Empty text="Sem alterações" /> : audit.map((a) => (
            <div key={a.id} className="flex justify-between border-b border-dashed border-slate-100 py-1.5 text-xs">
              <span><b>{a.entity}</b> · {a.action}</span><span className="text-slate-400">{fmtDateTime(a.at)}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Apagar todos os dados" className="border-rose-200" testid="reset-panel">
          <p className="mb-3 text-sm text-slate-500">Remove vendas, produtos, despesas e movimentações. Digite APAGAR para confirmar.</p>
          <div className="flex gap-2">
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="APAGAR" className="max-w-[180px]" data-testid="reset-confirm-input" />
            <Button variant="destructive" disabled={confirm !== "APAGAR"} onClick={reset} data-testid="reset-btn"><Trash2 className="mr-1 h-4 w-4" />Apagar tudo</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
