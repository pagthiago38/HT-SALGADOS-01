const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export const brl = (v) => BRL.format(Number(v) || 0);
export const num = (v) => NUM.format(Number(v) || 0);
export const pct = (v) => `${(Number(v) || 0).toFixed(1).replace(".", ",")}%`;
export const toNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export const ymd = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const today = () => ymd(new Date());

export function periodRange(kind, ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (kind === "day") return { start: ymd(d), end: ymd(d) };
  if (kind === "week") {
    const dow = (d.getDay() + 6) % 7;
    const s = new Date(d);
    s.setDate(d.getDate() - dow);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    return { start: ymd(s), end: ymd(e) };
  }
  const s = new Date(d.getFullYear(), d.getMonth(), 1);
  const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: ymd(s), end: ymd(e) };
}

export const fmtDate = (s) => (s ? s.split("-").reverse().join("/") : "");
export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
export const tone = (v) => (Number(v) >= 0 ? "text-emerald-600" : "text-rose-600");

export const MOVEMENT_LABELS = {
  prolabore: "Retirada de pró-labore",
  retirada: "Outra retirada",
  investimento: "Transferência p/ investimento",
  resgate_investimento: "Resgate de investimento",
  aporte: "Aporte / capital de giro",
  reserva_deposito: "Depósito na reserva",
  reserva_retirada: "Retirada da reserva",
};

export const STOCK_LABELS = {
  entrada: "Entrada",
  venda: "Saída por venda",
  perda: "Perda",
  vencido: "Vencido",
  ajuste: "Ajuste manual",
  estorno: "Estorno (cancelamento)",
};

export const BASE_LABELS = {
  resultado_operacional: "Resultado operacional",
  lucro_bruto: "Lucro bruto",
  faturamento: "Faturamento",
};

export const PRODUCT_CATEGORIES = ["Salgados", "Bebidas", "Sucos", "Refrigerantes", "Industrializados", "Outros"];
export const EXPENSE_CATEGORIES = ["Despesas fixas", "Custos extras", "Mercadorias", "Embalagens", "Manutenção", "Outros"];
export const UNITS = ["un", "kg", "g", "L", "ml", "cx", "pct", "dz"];
