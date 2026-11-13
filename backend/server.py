import asyncio
import os
import logging
import uuid
from contextlib import suppress
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Literal, Optional
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Query, Body
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
TZ = ZoneInfo("America/Sao_Paulo")
logger = logging.getLogger(__name__)

DATA_COLLECTIONS = ["products", "combos", "sales", "stock_movements", "expenses", "movements", "settings", "audit_log", "counters"]

INDEXES: dict[str, list[IndexModel]] = {
    "products": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "combos": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "sales": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("date", ASCENDING)], name="date"), IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "stock_movements": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("date", ASCENDING)], name="date"), IndexModel([("product_id", ASCENDING)], name="product")],
    "expenses": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("date", ASCENDING)], name="date")],
    "movements": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("date", ASCENDING)], name="date")],
    "audit_log": [IndexModel([("at", DESCENDING)], name="at_desc")],
    "snapshots": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
}

EXPENSE_CATEGORIES = ["Despesas fixas", "Custos extras", "Mercadorias", "Embalagens", "Manutenção", "Outros"]
PRODUCT_CATEGORIES = ["Salgados", "Bebidas", "Sucos", "Refrigerantes", "Industrializados", "Outros"]
DRINK_CATEGORIES = {"Bebidas", "Sucos", "Refrigerantes"}
MOVEMENT_TYPES = ["prolabore", "retirada", "investimento", "resgate_investimento", "aporte", "reserva_deposito", "reserva_retirada"]

DEFAULT_SETTINGS = {
    "id": "main",
    "company_name": "HT Salgados",
    "tithe_pct": 10.0,
    "opening_cash": 0.0,
    "allow_negative_stock": False,
    "default_min_stock": 5,
    "distribution": [
        {"key": "despesas_fixas", "label": "Despesas fixas", "pct": 30.0, "base": "faturamento", "mode": "informativo"},
        {"key": "custos_extras", "label": "Custos extras", "pct": 10.0, "base": "faturamento", "mode": "informativo"},
        {"key": "pro_labore", "label": "Pró-labore", "pct": 20.0, "base": "resultado_operacional", "mode": "destinacao"},
        {"key": "investimento", "label": "Investimento / Caixa", "pct": 6.0, "base": "resultado_operacional", "mode": "destinacao"},
        {"key": "reserva", "label": "Reserva de emergência (Saldo total em caixa)", "pct": 10.0, "base": "resultado_operacional", "mode": "destinacao"},
    ],
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def today_local() -> str:
    return datetime.now(TZ).strftime("%Y-%m-%d")


def new_id() -> str:
    return str(uuid.uuid4())


def r2(v: float) -> float:
    return round(float(v or 0) + 0.0, 2)


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


async def get_settings() -> dict:
    s = await db.settings.find_one({"id": "main"}, {"_id": 0})
    if not s:
        s = dict(DEFAULT_SETTINGS)
        await db.settings.insert_one(dict(s))
    return {**DEFAULT_SETTINGS, **s}


async def audit(entity: str, entity_id: str, action: str, before=None, after=None):
    await db.audit_log.insert_one({"id": new_id(), "entity": entity, "entity_id": entity_id, "action": action,
                                   "before": before, "after": after, "at": now_utc().isoformat()})


async def next_number(name: str) -> int:
    doc = await db.counters.find_one_and_update({"id": name}, {"$inc": {"value": 1}}, upsert=True, return_document=True)
    return doc["value"]


async def get_or_404(coll: str, item_id: str) -> dict:
    doc = await db[coll].find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registro não encontrado")
    return doc


# ---------- Models ----------
class CostExtras(BaseModel):
    packaging: float = Field(default=0, ge=0)
    freight: float = Field(default=0, ge=0)
    extra_costs: float = Field(default=0, ge=0)
    card_fee_pct: float = Field(default=0, ge=0, le=100)
    tax_pct: float = Field(default=0, ge=0, le=100)
    target_margin_pct: float = Field(default=30, ge=0, le=95)


class ProductIn(CostExtras):
    name: str = Field(min_length=1)
    category: str
    cost: float = Field(ge=0)
    price: float = Field(ge=0)
    unit: str = "un"
    min_stock: float = Field(default=5, ge=0)
    initial_stock: float = Field(default=0, ge=0)


class ComboItem(BaseModel):
    product_id: str
    qty: float = Field(gt=0)


class ComboIn(CostExtras):
    name: str = Field(min_length=1)
    price: float = Field(ge=0)
    items: List[ComboItem] = Field(min_length=1)
    active: bool = True


class SaleItemIn(BaseModel):
    type: Literal["product", "combo"]
    ref_id: str
    qty: float = Field(gt=0)


class SaleIn(BaseModel):
    items: List[SaleItemIn] = Field(min_length=1)
    note: str = ""


class CancelIn(BaseModel):
    reason: str = Field(min_length=1)


class StockMoveIn(BaseModel):
    product_id: str
    type: Literal["entrada", "perda", "vencido", "ajuste"]
    qty: float = Field(default=0, ge=0)
    counted: Optional[float] = Field(default=None, ge=0)
    unit_cost: Optional[float] = Field(default=None, ge=0)
    update_cost: bool = True
    register_expense: bool = False
    note: str = ""


class ExpenseIn(BaseModel):
    description: str = Field(min_length=1)
    category: str
    amount: float = Field(gt=0)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    note: str = ""


class MovementIn(BaseModel):
    type: str
    amount: float = Field(gt=0)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    note: str = ""


class EditIn(BaseModel):
    reason: str = ""


class DistItem(BaseModel):
    key: str
    label: str
    pct: float = Field(ge=0, le=100)
    base: Literal["faturamento", "lucro_bruto", "resultado_operacional"]
    mode: Literal["informativo", "destinacao"]


class SettingsIn(BaseModel):
    company_name: str
    tithe_pct: float = Field(ge=0, le=100)
    opening_cash: float = 0
    allow_negative_stock: bool = False
    default_min_stock: float = 5
    distribution: List[DistItem]


# ---------- Unit cost composition ----------
def cost_breakdown(base: float, price: float, d: dict) -> dict:
    g = lambda k: float(d.get(k) or 0)
    fixed = base + g("packaging") + g("freight") + g("extra_costs")
    pct_total = g("card_fee_pct") + g("tax_pct")
    total = fixed + price * pct_total / 100
    contribution = price - total
    denom = 1 - (pct_total + g("target_margin_pct")) / 100
    return {"merch_cost": r2(base), "card_fee_value": r2(price * g("card_fee_pct") / 100), "tax_value": r2(price * g("tax_pct") / 100),
            "fixed_unit_cost": r2(fixed), "unit_cost_total": r2(total), "contribution": r2(contribution),
            "contribution_margin": r2(contribution / price * 100) if price else 0.0,
            "sales_margin": r2((price - base) / price * 100) if price else 0.0,
            "suggested_price": r2(fixed / denom) if denom > 0 else None}


def product_unit_cost(p: dict) -> float:
    return cost_breakdown(p["cost"], p["price"], p)["unit_cost_total"]


# ---------- Core calculation ----------
def distribute(settings: dict, revenue: float, gross: float, op_result: float, expense_by_cat: dict) -> dict:
    bases = {"faturamento": revenue, "lucro_bruto": gross, "resultado_operacional": op_result}
    allowed = op_result > 0
    items, values = [], {}
    for d in settings["distribution"]:
        base_val = bases.get(d["base"], 0)
        value = r2(max(base_val, 0) * d["pct"] / 100)
        row = {**d, "base_value": r2(base_val)}
        if d["mode"] == "destinacao":
            row["value"] = value if allowed else 0.0
            values[d["key"]] = row["value"]
        else:
            row["value"] = value
            actual_cat = {"despesas_fixas": "Despesas fixas", "custos_extras": "Custos extras"}.get(d["key"])
            row["actual"] = r2(expense_by_cat.get(actual_cat, 0)) if actual_cat else None
        items.append(row)
    pro_labore = values.get("pro_labore", 0.0)
    tithe = r2(pro_labore * settings["tithe_pct"] / 100)
    reserve = values.get("reserva", 0.0)
    invest = values.get("investimento", 0.0)
    other = sum(v for k, v in values.items() if k not in ("pro_labore", "reserva", "investimento"))
    remaining = r2(op_result - pro_labore - reserve - invest - other) if allowed else r2(op_result)
    return {"items": items, "allowed": allowed, "pro_labore": pro_labore, "tithe": tithe,
            "tithe_pct": settings["tithe_pct"], "pro_labore_net": r2(pro_labore - tithe),
            "reserve": reserve, "investment": invest, "other": r2(other), "remaining_profit": remaining,
            "over_distributed": allowed and remaining < 0}


async def compute_period(start: str, end: str, settings: dict) -> dict:
    sales = await db.sales.find({"status": "ativa", "date": {"$gte": start, "$lte": end}}, {"_id": 0}).to_list(None)
    expenses = await db.expenses.find({"status": "ativo", "date": {"$gte": start, "$lte": end}}, {"_id": 0}).to_list(None)
    losses_mv = await db.stock_movements.find({"type": {"$in": ["perda", "vencido"]}, "date": {"$gte": start, "$lte": end}}, {"_id": 0}).to_list(None)
    revenue = r2(sum(s["total"] for s in sales))
    cmv = r2(sum(s["cost_total"] for s in sales))
    items_sold = sum(line["qty"] for s in sales for line in s["items"])
    exp_by_cat = defaultdict(float)
    for e in expenses:
        exp_by_cat[e["category"]] += e["amount"]
    purchases = r2(exp_by_cat.get("Mercadorias", 0))
    op_expenses = r2(sum(v for k, v in exp_by_cat.items() if k != "Mercadorias"))
    losses = r2(sum(abs(m["qty"]) * m.get("unit_cost", 0) for m in losses_mv))
    gross = r2(revenue - cmv)
    op_result = r2(gross - op_expenses - losses)
    dist = distribute(settings, revenue, gross, op_result, exp_by_cat)
    return {"start": start, "end": end, "revenue": revenue, "cmv": cmv, "gross_profit": gross,
            "op_expenses": op_expenses, "purchases": purchases, "losses": losses, "op_result": op_result,
            "sales_count": len(sales), "items_sold": items_sold,
            "avg_ticket": r2(revenue / len(sales)) if sales else 0.0,
            "expenses_by_category": {k: r2(v) for k, v in exp_by_cat.items()},
            "distribution": dist, "_sales": sales, "_expenses": expenses}


async def sum_movements(match: dict) -> dict:
    out = defaultdict(float)
    async for m in db.movements.find({"status": "ativo", **match}, {"_id": 0, "type": 1, "amount": 1}):
        out[m["type"]] += m["amount"]
    return out


async def balances(settings: dict) -> dict:
    sales_total = 0.0
    async for g in db.sales.aggregate([{"$match": {"status": "ativa"}}, {"$group": {"_id": None, "t": {"$sum": "$total"}}}]):
        sales_total = g["t"]
    exp_total = 0.0
    async for g in db.expenses.aggregate([{"$match": {"status": "ativo"}}, {"$group": {"_id": None, "t": {"$sum": "$amount"}}}]):
        exp_total = g["t"]
    mv = await sum_movements({})
    cash = (settings.get("opening_cash", 0) + sales_total - exp_total - mv["prolabore"] - mv["retirada"]
            - mv["investimento"] + mv["resgate_investimento"] + mv["aporte"] - mv["reserva_deposito"] + mv["reserva_retirada"])
    stock_value = 0.0
    async for p in db.products.find({"active": True}, {"_id": 0, "stock": 1, "cost": 1}):
        stock_value += max(p["stock"], 0) * p["cost"]
    return {"cash": r2(cash), "reserve": r2(mv["reserva_deposito"] - mv["reserva_retirada"]),
            "investment": r2(mv["investimento"] - mv["resgate_investimento"]), "stock_value": r2(stock_value),
            "working_capital": r2(cash + stock_value), "total_withdrawals": r2(mv["prolabore"] + mv["retirada"]),
            "total_contributions": r2(mv["aporte"])}


def daily_series(start: str, end: str, sales: list, expenses: list) -> list:
    days = []
    d = datetime.strptime(start, "%Y-%m-%d")
    e = datetime.strptime(end, "%Y-%m-%d")
    rev, exp = defaultdict(float), defaultdict(float)
    for s in sales:
        rev[s["date"]] += s["total"]
    for x in expenses:
        exp[x["date"]] += x["amount"]
    while d <= e and len(days) < 400:
        k = d.strftime("%Y-%m-%d")
        days.append({"date": k, "revenue": r2(rev[k]), "expenses": r2(exp[k])})
        d += timedelta(days=1)
    return days


def rank_lines(sales: list, pred) -> list:
    agg = {}
    for s in sales:
        for line in s["items"]:
            if not pred(line):
                continue
            a = agg.setdefault(line["ref_id"], {"name": line["name"], "category": line.get("category"), "type": line["type"], "qty": 0, "revenue": 0.0, "cost": 0.0})
            a["qty"] += line["qty"]
            a["revenue"] += line["total"]
            a["cost"] += line["cost_total"]
    rows = [{**v, "revenue": r2(v["revenue"]), "cost": r2(v["cost"]), "profit": r2(v["revenue"] - v["cost"])} for v in agg.values()]
    return sorted(rows, key=lambda x: x["qty"], reverse=True)


def month_bounds(ref: Optional[str] = None):
    d = datetime.strptime(ref, "%Y-%m-%d") if ref else datetime.now(TZ)
    start = d.replace(day=1)
    nxt = (start + timedelta(days=32)).replace(day=1)
    return start.strftime("%Y-%m-%d"), (nxt - timedelta(days=1)).strftime("%Y-%m-%d")


def public(p: dict) -> dict:
    return {k: v for k, v in p.items() if not k.startswith("_")}


# ---------- App ----------
app = FastAPI()
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"message": "HT Salgados API"}


@api.get("/meta")
async def meta():
    return {"product_categories": PRODUCT_CATEGORIES, "expense_categories": EXPENSE_CATEGORIES, "movement_types": MOVEMENT_TYPES}


# Products
def product_view(p: dict) -> dict:
    defaults = CostExtras().model_dump()
    p = {**defaults, **{k: v for k, v in p.items() if v is not None}}
    b = cost_breakdown(p["cost"], p["price"], p)
    return {**p, **b, "margin": b["contribution_margin"], "profit_unit": b["contribution"], "low_stock": p["stock"] <= p.get("min_stock", 0)}


@api.get("/products")
async def list_products(include_inactive: bool = False):
    q = {} if include_inactive else {"active": True}
    docs = await db.products.find(q, {"_id": 0}).sort("name", 1).to_list(None)
    return [product_view(p) for p in docs]


@api.post("/products")
async def create_product(body: ProductIn):
    doc = {"id": new_id(), **body.model_dump(exclude={"initial_stock"}), "stock": 0.0, "active": True, "created_at": now_utc().isoformat()}
    await db.products.insert_one(dict(doc))
    if body.initial_stock > 0:
        await apply_stock_move(doc, "entrada", body.initial_stock, body.cost, "Estoque inicial no cadastro")
        doc["stock"] = body.initial_stock
    await audit("product", doc["id"], "create", None, public(doc))
    return product_view(doc)


@api.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn):
    before = await get_or_404("products", pid)
    upd = body.model_dump(exclude={"initial_stock"})
    await db.products.update_one({"id": pid}, {"$set": upd})
    after = {**before, **upd}
    await audit("product", pid, "update", before, after)
    return product_view(after)


@api.delete("/products/{pid}")
async def delete_product(pid: str):
    before = await get_or_404("products", pid)
    used = await db.combos.find_one({"active": True, "items.product_id": pid})
    if used:
        raise HTTPException(400, f"Produto é componente do combo '{used['name']}'. Remova-o do combo antes.")
    await db.products.update_one({"id": pid}, {"$set": {"active": False}})
    await audit("product", pid, "delete", before, None)
    return {"ok": True}


# Combos
async def combo_view(c: dict, products: dict) -> dict:
    items, cost = [], 0.0
    for it in c["items"]:
        p = products.get(it["product_id"])
        unit_cost = p["cost"] if p else 0
        cost += unit_cost * it["qty"]
        items.append({**it, "name": p["name"] if p else "(produto removido)", "unit_cost": unit_cost, "unit_price": p["price"] if p else 0, "stock": p["stock"] if p else 0})
    individual = sum(i["unit_price"] * i["qty"] for i in items)
    c = {**CostExtras().model_dump(), **c}
    b = cost_breakdown(cost, c["price"], c)
    return {**c, **b, "items": items, "cost": b["unit_cost_total"], "gross_profit": b["contribution"], "margin": b["contribution_margin"],
            "individual_price": r2(individual)}


async def products_map(include_inactive=True) -> dict:
    q = {} if include_inactive else {"active": True}
    return {p["id"]: p for p in await db.products.find(q, {"_id": 0}).to_list(None)}


@api.get("/combos")
async def list_combos(include_inactive: bool = False):
    pm = await products_map()
    q = {"deleted": {"$ne": True}} if include_inactive else {"active": True, "deleted": {"$ne": True}}
    docs = await db.combos.find(q, {"_id": 0}).sort("name", 1).to_list(None)
    return [await combo_view(c, pm) for c in docs]


async def validate_combo(body: ComboIn):
    pm = await products_map(False)
    for it in body.items:
        if it.product_id not in pm:
            raise HTTPException(400, "Produto do combo não encontrado")


@api.post("/combos")
async def create_combo(body: ComboIn):
    await validate_combo(body)
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_utc().isoformat()}
    await db.combos.insert_one(dict(doc))
    await audit("combo", doc["id"], "create", None, doc)
    return await combo_view(doc, await products_map())


@api.put("/combos/{cid}")
async def update_combo(cid: str, body: ComboIn):
    before = await get_or_404("combos", cid)
    await validate_combo(body)
    await db.combos.update_one({"id": cid}, {"$set": body.model_dump()})
    after = {**before, **body.model_dump()}
    await audit("combo", cid, "update", before, after)
    return await combo_view(after, await products_map())


@api.delete("/combos/{cid}")
async def delete_combo(cid: str):
    before = await get_or_404("combos", cid)
    await db.combos.update_one({"id": cid}, {"$set": {"active": False, "deleted": True}})
    await audit("combo", cid, "delete", before, None)
    return {"ok": True}


# Stock
async def apply_stock_move(product: dict, mtype: str, delta: float, unit_cost: float, note: str, sale_id: Optional[str] = None):
    await db.products.update_one({"id": product["id"]}, {"$inc": {"stock": delta}})
    doc = {"id": new_id(), "product_id": product["id"], "product_name": product["name"], "type": mtype, "qty": delta,
           "unit_cost": unit_cost, "note": note, "sale_id": sale_id, "date": today_local(), "created_at": now_utc().isoformat()}
    await db.stock_movements.insert_one(doc)


@api.get("/stock/movements")
async def list_stock_movements(product_id: Optional[str] = None, type: Optional[str] = None, limit: int = Query(200, le=2000)):
    q = {}
    if product_id:
        q["product_id"] = product_id
    if type:
        q["type"] = type
    return await db.stock_movements.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


@api.post("/stock/movements")
async def create_stock_movement(body: StockMoveIn):
    p = await get_or_404("products", body.product_id)
    if body.type == "ajuste":
        if body.counted is None:
            raise HTTPException(400, "Informe a quantidade contada")
        delta = body.counted - p["stock"]
        if delta == 0:
            raise HTTPException(400, "Estoque já está com essa quantidade")
        await apply_stock_move(p, "ajuste", delta, p["cost"], body.note or "Ajuste manual")
        return {"ok": True, "delta": delta}
    if body.qty <= 0:
        raise HTTPException(400, "Quantidade deve ser maior que zero")
    if body.type == "entrada":
        unit_cost = body.unit_cost if body.unit_cost is not None else p["cost"]
        if body.update_cost and body.unit_cost is not None:
            old = max(p["stock"], 0)
            new_cost = (old * p["cost"] + body.qty * unit_cost) / (old + body.qty)
            await db.products.update_one({"id": p["id"]}, {"$set": {"cost": r2(new_cost)}})
        await apply_stock_move(p, "entrada", body.qty, unit_cost, body.note or "Entrada de mercadoria")
        if body.register_expense:
            await insert_expense({"description": f"Compra: {p['name']} ({body.qty:g} {p['unit']})", "category": "Mercadorias",
                                  "amount": r2(body.qty * unit_cost), "date": today_local(), "note": body.note})
        return {"ok": True}
    if not (await get_settings())["allow_negative_stock"] and p["stock"] < body.qty:
        raise HTTPException(400, f"Estoque insuficiente de {p['name']} (atual: {p['stock']:g})")
    await apply_stock_move(p, body.type, -body.qty, p["cost"], body.note)
    return {"ok": True}


# Sales
@api.post("/sales")
async def create_sale(body: SaleIn):
    settings = await get_settings()
    pm = await products_map(False)
    combos = {c["id"]: c for c in await db.combos.find({"active": True}, {"_id": 0}).to_list(None)}
    lines, needs = [], defaultdict(float)
    for it in body.items:
        if it.type == "product":
            p = pm.get(it.ref_id)
            if not p:
                raise HTTPException(400, "Produto não encontrado")
            needs[p["id"]] += it.qty
            uc = product_unit_cost(p)
            lines.append({"type": "product", "ref_id": p["id"], "name": p["name"], "category": p["category"], "qty": it.qty,
                          "unit_price": p["price"], "unit_cost": uc, "merch_cost": p["cost"], "total": r2(p["price"] * it.qty), "cost_total": r2(uc * it.qty)})
        else:
            c = combos.get(it.ref_id)
            if not c:
                raise HTTPException(400, "Combo não encontrado")
            unit_cost = 0.0
            comps = []
            for ci in c["items"]:
                p = pm.get(ci["product_id"])
                if not p:
                    raise HTTPException(400, f"Componente do combo {c['name']} indisponível")
                needs[p["id"]] += ci["qty"] * it.qty
                unit_cost += p["cost"] * ci["qty"]
                comps.append({"product_id": p["id"], "name": p["name"], "qty": ci["qty"] * it.qty, "unit_cost": p["cost"]})
            unit_cost = cost_breakdown(unit_cost, c["price"], c)["unit_cost_total"]
            lines.append({"type": "combo", "ref_id": c["id"], "name": c["name"], "category": "Combos", "qty": it.qty,
                          "unit_price": c["price"], "unit_cost": r2(unit_cost), "total": r2(c["price"] * it.qty),
                          "cost_total": r2(unit_cost * it.qty), "components": comps})
    if not settings["allow_negative_stock"]:
        for pid, q in needs.items():
            if pm[pid]["stock"] < q:
                raise HTTPException(400, f"Estoque insuficiente de {pm[pid]['name']} (atual: {pm[pid]['stock']:g}, necessário: {q:g})")
    now = now_utc()
    sale = {"id": new_id(), "number": await next_number("sales"), "items": lines, "total": r2(sum(line["total"] for line in lines)),
            "cost_total": r2(sum(line["cost_total"] for line in lines)), "note": body.note, "status": "ativa",
            "date": now.astimezone(TZ).strftime("%Y-%m-%d"), "created_at": now.isoformat()}
    await db.sales.insert_one(dict(sale))
    for pid, q in needs.items():
        await apply_stock_move(pm[pid], "venda", -q, pm[pid]["cost"], f"Venda #{sale['number']}", sale["id"])
    return sale


@api.get("/sales")
async def list_sales(start: Optional[str] = None, end: Optional[str] = None, limit: int = Query(300, le=5000)):
    q = {}
    if start and end:
        q["date"] = {"$gte": start, "$lte": end}
    return await db.sales.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


@api.post("/sales/{sid}/cancel")
async def cancel_sale(sid: str, body: CancelIn):
    sale = await get_or_404("sales", sid)
    if sale["status"] != "ativa":
        raise HTTPException(400, "Venda já cancelada")
    res = await db.sales.update_one({"id": sid, "status": "ativa"}, {"$set": {"status": "cancelada", "cancel_reason": body.reason, "canceled_at": now_utc().isoformat()}})
    if res.modified_count != 1:
        raise HTTPException(400, "Venda já cancelada")
    pm = await products_map()
    async for m in db.stock_movements.find({"sale_id": sid, "type": "venda"}, {"_id": 0}):
        p = pm.get(m["product_id"])
        if p:
            await apply_stock_move(p, "estorno", -m["qty"], m["unit_cost"], f"Cancelamento venda #{sale['number']}: {body.reason}", sid)
    await audit("sale", sid, "cancel", {"status": "ativa"}, {"status": "cancelada", "reason": body.reason})
    return {"ok": True}


# Expenses & movements (edit with history, cancel instead of delete)
async def insert_expense(data: dict) -> dict:
    doc = {"id": new_id(), **data, "status": "ativo", "history": [], "created_at": now_utc().isoformat()}
    await db.expenses.insert_one(dict(doc))
    await audit("expense", doc["id"], "create", None, data)
    return doc


@api.get("/expenses")
async def list_expenses(start: Optional[str] = None, end: Optional[str] = None, include_cancelled: bool = True):
    q = {} if include_cancelled else {"status": "ativo"}
    if start and end:
        q["date"] = {"$gte": start, "$lte": end}
    return await db.expenses.find(q, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(None)


@api.post("/expenses")
async def create_expense(body: ExpenseIn):
    if body.category not in EXPENSE_CATEGORIES:
        raise HTTPException(400, "Categoria inválida")
    return await insert_expense(body.model_dump())


async def edit_record(coll: str, entity: str, rid: str, data: dict):
    before = await get_or_404(coll, rid)
    if before["status"] != "ativo":
        raise HTTPException(400, "Lançamento cancelado não pode ser editado")
    snapshot = {k: before.get(k) for k in data}
    snapshot["changed_at"] = now_utc().isoformat()
    await db[coll].update_one({"id": rid}, {"$set": data, "$push": {"history": snapshot}})
    await audit(entity, rid, "update", snapshot, data)
    return await get_or_404(coll, rid)


async def cancel_record(coll: str, entity: str, rid: str, reason: str):
    before = await get_or_404(coll, rid)
    if before["status"] != "ativo":
        raise HTTPException(400, "Lançamento já cancelado")
    await db[coll].update_one({"id": rid}, {"$set": {"status": "cancelado", "cancel_reason": reason, "canceled_at": now_utc().isoformat()}})
    await audit(entity, rid, "cancel", {"status": "ativo"}, {"status": "cancelado", "reason": reason})
    return {"ok": True}


@api.put("/expenses/{eid}")
async def update_expense(eid: str, body: ExpenseIn):
    if body.category not in EXPENSE_CATEGORIES:
        raise HTTPException(400, "Categoria inválida")
    return await edit_record("expenses", "expense", eid, body.model_dump())


@api.post("/expenses/{eid}/cancel")
async def cancel_expense(eid: str, body: CancelIn):
    return await cancel_record("expenses", "expense", eid, body.reason)


@api.get("/movements")
async def list_movements(start: Optional[str] = None, end: Optional[str] = None, type: Optional[str] = None):
    q = {}
    if start and end:
        q["date"] = {"$gte": start, "$lte": end}
    if type:
        q["type"] = {"$in": type.split(",")}
    return await db.movements.find(q, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(None)


async def ensure_non_negative(exclude_id: Optional[str] = None, add: Optional[MovementIn] = None):
    mv = await sum_movements({"id": {"$ne": exclude_id}} if exclude_id else {})
    if add:
        mv[add.type] += add.amount
    if mv["reserva_deposito"] - mv["reserva_retirada"] < -0.001:
        raise HTTPException(400, "Saldo da reserva ficaria negativo")
    if mv["investimento"] - mv["resgate_investimento"] < -0.001:
        raise HTTPException(400, "Saldo de investimento ficaria negativo")


async def validate_movement(body: MovementIn, exclude_id: Optional[str] = None):
    if body.type not in MOVEMENT_TYPES:
        raise HTTPException(400, "Tipo inválido")
    await ensure_non_negative(exclude_id, body)


@api.post("/movements")
async def create_movement(body: MovementIn):
    await validate_movement(body)
    doc = {"id": new_id(), **body.model_dump(), "status": "ativo", "history": [], "created_at": now_utc().isoformat()}
    await db.movements.insert_one(dict(doc))
    await audit("movement", doc["id"], "create", None, body.model_dump())
    return public(doc)


@api.put("/movements/{mid}")
async def update_movement(mid: str, body: MovementIn):
    await validate_movement(body, mid)
    return await edit_record("movements", "movement", mid, body.model_dump())


@api.post("/movements/{mid}/cancel")
async def cancel_movement(mid: str, body: CancelIn):
    await ensure_non_negative(mid)
    return await cancel_record("movements", "movement", mid, body.reason)


# Settings
@api.get("/settings")
async def read_settings():
    return await get_settings()


@api.put("/settings")
async def write_settings(body: SettingsIn):
    before = await get_settings()
    data = body.model_dump()
    await db.settings.update_one({"id": "main"}, {"$set": data}, upsert=True)
    await audit("settings", "main", "update", before, data)
    return await get_settings()


# Aggregated views
@api.get("/dashboard")
async def dashboard():
    try:
        await auto_snapshot()
    except Exception as exc:
        logger.error("auto_snapshot failed: %s", exc)
    s = await get_settings()
    today = today_local()
    ms, me = month_bounds()
    month = await compute_period(ms, me, s)
    day = await compute_period(today, today, s)
    bal = await balances(s)
    pl_taken = (await sum_movements({"type": "prolabore", "date": {"$gte": ms, "$lte": me}}))["prolabore"]
    low = [product_view(p) for p in await db.products.find({"active": True}, {"_id": 0}).to_list(None)]
    low = [p for p in low if p["low_stock"]]
    recent = await db.sales.find({"status": "ativa"}, {"_id": 0}).sort("created_at", -1).limit(6).to_list(6)
    by_cat = defaultdict(float)
    for e in month["_expenses"]:
        by_cat[e["category"]] += e["amount"]
    return {"today": public(day), "month": public(month), "balances": bal, "pro_labore_taken": r2(pl_taken),
            "series": daily_series(ms, me, month["_sales"], month["_expenses"]),
            "top_products": rank_lines(month["_sales"], lambda line: True)[:8],
            "expenses_by_category": [{"category": k, "amount": r2(v)} for k, v in by_cat.items()],
            "low_stock": low, "recent_sales": recent}


@api.get("/adm")
async def adm(start: str, end: str):
    s = await get_settings()
    period = await compute_period(start, end, s)
    mv = await sum_movements({"date": {"$gte": start, "$lte": end}})
    bal = await balances(s)
    dist = period["distribution"]
    return {**public(period), "balances": bal, "settings": s,
            "pro_labore_taken": r2(mv["prolabore"]), "pro_labore_available": r2(dist["pro_labore"] - mv["prolabore"]),
            "reserve_deposits": r2(mv["reserva_deposito"]), "reserve_withdrawals": r2(mv["reserva_retirada"]),
            "reserve_pending": r2(dist["reserve"] - mv["reserva_deposito"] + mv["reserva_retirada"]),
            "investment_done": r2(mv["investimento"]), "other_withdrawals": r2(mv["retirada"])}


@api.get("/finance")
async def finance(start: str, end: str):
    s = await get_settings()
    period = await compute_period(start, end, s)
    entries = []
    per_day = defaultdict(lambda: [0.0, 0])
    for sale in period["_sales"]:
        per_day[sale["date"]][0] += sale["total"]
        per_day[sale["date"]][1] += 1
    for d, (t, n) in per_day.items():
        entries.append({"id": f"sales-{d}", "date": d, "kind": "venda", "label": f"Vendas do dia ({n})", "amount": r2(t), "direction": "in", "status": "ativo"})
    for e in await list_expenses(start, end, True):
        entries.append({"id": e["id"], "date": e["date"], "kind": "compra" if e["category"] == "Mercadorias" else "despesa",
                        "label": f"{e['description']} · {e['category']}", "amount": e["amount"], "direction": "out", "status": e["status"], "source": "expense"})
    inflow = {"resgate_investimento", "aporte", "reserva_retirada"}
    for m in await list_movements(start, end):
        entries.append({"id": m["id"], "date": m["date"], "kind": m["type"], "label": m.get("note") or m["type"], "amount": m["amount"],
                        "direction": "in" if m["type"] in inflow else "out", "status": m["status"], "source": "movement", "raw": m})
    entries.sort(key=lambda x: x["date"], reverse=True)
    mv = await sum_movements({"date": {"$gte": start, "$lte": end}})
    exp_total = sum(period["expenses_by_category"].values())
    totals = {"sales_in": period["revenue"], "expenses_out": r2(exp_total - period["purchases"]), "purchases_out": period["purchases"],
              "withdrawals": r2(mv["prolabore"] + mv["retirada"]), "investments": r2(mv["investimento"] - mv["resgate_investimento"]),
              "contributions": r2(mv["aporte"]), "reserve_net": r2(mv["reserva_deposito"] - mv["reserva_retirada"])}
    totals["net_cash_flow"] = r2(totals["sales_in"] - totals["expenses_out"] - totals["purchases_out"] - totals["withdrawals"]
                                 - totals["investments"] + totals["contributions"] - totals["reserve_net"])
    return {"entries": entries, "totals": totals, "balances": await balances(s), "revenue": period["revenue"],
            "op_result": period["op_result"], "remaining_profit": period["distribution"]["remaining_profit"]}


@api.get("/reports")
async def reports(start: str, end: str):
    s = await get_settings()
    period = await compute_period(start, end, s)
    sales = period["_sales"]
    by_cat = defaultdict(lambda: {"qty": 0, "revenue": 0.0})
    for sale in sales:
        for line in sale["items"]:
            by_cat[line["category"]]["qty"] += line["qty"]
            by_cat[line["category"]]["revenue"] += line["total"]
    mv = await sum_movements({"date": {"$gte": start, "$lte": end}})
    return {**public(period), "series": daily_series(start, end, sales, period["_expenses"]),
            "by_category": sorted([{"category": k, "qty": v["qty"], "revenue": r2(v["revenue"])} for k, v in by_cat.items()], key=lambda x: -x["revenue"]),
            "top_products": rank_lines(sales, lambda line: line["type"] == "product"),
            "top_combos": rank_lines(sales, lambda line: line["type"] == "combo"),
            "top_drinks": rank_lines(sales, lambda line: line["type"] == "product" and line.get("category") in DRINK_CATEGORIES),
            "pro_labore_taken": r2(mv["prolabore"]), "reserve_deposits": r2(mv["reserva_deposito"]), "reserve_withdrawals": r2(mv["reserva_retirada"]),
            "reserve_balance": (await balances(s))["reserve"]}


@api.get("/audit")
async def audit_list(limit: int = Query(100, le=1000)):
    return await db.audit_log.find({}, {"_id": 0}).sort("at", -1).limit(limit).to_list(limit)


# Backup
async def dump_all() -> dict:
    return {c: await db[c].find({}, {"_id": 0}).to_list(None) for c in DATA_COLLECTIONS}


async def make_snapshot(reason: str) -> dict:
    data = await dump_all()
    snap = {"id": new_id(), "reason": reason, "created_at": now_utc().isoformat(), "date": today_local(),
            "counts": {k: len(v) for k, v in data.items()}, "data": data}
    await db.snapshots.insert_one(dict(snap))
    old = await db.snapshots.find({}, {"_id": 0, "id": 1}).sort("created_at", -1).skip(30).to_list(None)
    if old:
        await db.snapshots.delete_many({"id": {"$in": [o["id"] for o in old]}})
    return snap


async def auto_snapshot():
    if not await db.snapshots.find_one({"date": today_local(), "reason": "Automático diário"}):
        await make_snapshot("Automático diário")


async def replace_all(data: dict):
    for c in DATA_COLLECTIONS:
        await db[c].delete_many({})
        docs = [dict(d) for d in data.get(c, []) if isinstance(d, dict)]
        if docs:
            await db[c].insert_many(docs)


@api.get("/backup")
async def export_backup():
    return {"app": "ht-salgados", "version": 1, "exported_at": now_utc().isoformat(), "data": await dump_all()}


@api.post("/backup/restore")
async def restore_backup(payload: dict = Body(...)):
    data = payload.get("data")
    if payload.get("app") != "ht-salgados" or not isinstance(data, dict):
        raise HTTPException(400, "Arquivo de backup inválido")
    await make_snapshot("Antes de restaurar backup")
    await replace_all(data)
    await audit("backup", "restore", "restore", None, {"exported_at": payload.get("exported_at")})
    return {"ok": True}


@api.get("/backup/snapshots")
async def list_snapshots():
    return await db.snapshots.find({}, {"_id": 0, "data": 0}).sort("created_at", -1).to_list(None)


@api.post("/backup/snapshots")
async def create_snapshot():
    snap = await make_snapshot("Manual")
    return {k: v for k, v in snap.items() if k != "data"}


@api.post("/backup/snapshots/{snap_id}/restore")
async def restore_snapshot(snap_id: str):
    snap = await db.snapshots.find_one({"id": snap_id}, {"_id": 0})
    if not snap:
        raise HTTPException(404, "Ponto de restauração não encontrado")
    await make_snapshot("Antes de restaurar ponto")
    await replace_all(snap["data"])
    await audit("backup", snap_id, "restore_snapshot", None, None)
    return {"ok": True}


@api.post("/backup/reset")
async def reset_all(payload: dict = Body(...)):
    if payload.get("confirm") != "APAGAR":
        raise HTTPException(400, "Digite APAGAR para confirmar")
    await make_snapshot("Antes de apagar tudo")
    await replace_all({})
    await get_settings()
    return {"ok": True}


# Seed editable sample products
async def seed():
    if await db.settings.find_one({"id": "main"}):
        return
    await get_settings()
    samples = [
        ("Coxinha de Frango", "Salgados", 1.20, 4.00, 120), ("Kibe com Queijo", "Salgados", 1.30, 4.50, 80),
        ("Pastel de Carne", "Salgados", 1.50, 5.00, 60), ("Empada de Palmito", "Salgados", 1.60, 5.00, 50),
        ("Refrigerante Lata 350ml", "Refrigerantes", 2.80, 6.00, 48), ("Suco Natural 300ml", "Sucos", 1.80, 6.00, 30),
        ("Água Mineral 500ml", "Bebidas", 0.90, 3.00, 40), ("Batata Chips 45g", "Industrializados", 2.50, 5.50, 20),
    ]
    ids = {}
    for name, cat, cost, price, stock in samples:
        p = await create_product(ProductIn(name=name, category=cat, cost=cost, price=price, unit="un", min_stock=10, initial_stock=stock))
        ids[name] = p["id"]
    await create_combo(ComboIn(name="Combo 1 — 5 salgados + refri", price=22.0,
                               items=[ComboItem(product_id=ids["Coxinha de Frango"], qty=5), ComboItem(product_id=ids["Refrigerante Lata 350ml"], qty=1)]))


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','), allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


@app.on_event("startup")
async def startup():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    try:
        await seed()
    except Exception as exc:
        logger.error("seed failed: %s", exc)


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
