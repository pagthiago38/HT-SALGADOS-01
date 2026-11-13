# HT Salgados regression tests: products/combos cost composition, sales, stock, expenses, movements, ADM compute, backup
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
S = requests.Session()
CREATED = {"products": [], "combos": [], "sales": [], "expenses": [], "movements": []}


def approx(a, b, tol=0.011):
    return abs(float(a) - float(b)) <= tol


def mk_product(**kw):
    body = {"name": "TEST_Prod", "category": "Salgados", "cost": 2.0, "price": 10.0, "min_stock": 1, "initial_stock": 50,
            "packaging": 0.5, "freight": 0.3, "extra_costs": 0.2, "card_fee_pct": 5, "tax_pct": 6, "target_margin_pct": 30}
    body.update(kw)
    r = S.post(f"{API}/products", json=body)
    assert r.status_code == 200, r.text
    CREATED["products"].append(r.json()["id"])
    return r.json()


def get_product(pid):
    return next(p for p in S.get(f"{API}/products", params={"include_inactive": True}).json() if p["id"] == pid)


def today():
    return S.get(f"{API}/dashboard").json()["today"]["start"]


@pytest.fixture(scope="session", autouse=True)
def cleanup():
    yield
    for sid in CREATED["sales"]:
        S.post(f"{API}/sales/{sid}/cancel", json={"reason": "TEST cleanup"})
    for eid in CREATED["expenses"]:
        S.post(f"{API}/expenses/{eid}/cancel", json={"reason": "TEST cleanup"})
    for mid in reversed(CREATED["movements"]):
        S.post(f"{API}/movements/{mid}/cancel", json={"reason": "TEST cleanup"})
    for cid in CREATED["combos"]:
        S.delete(f"{API}/combos/{cid}")
    for pid in CREATED["products"]:
        S.delete(f"{API}/products/{pid}")


# Health / meta
def test_root_and_meta():
    assert S.get(f"{API}/").json()["message"] == "HT Salgados API"
    m = S.get(f"{API}/meta").json()
    assert "Mercadorias" in m["expense_categories"] and "reserva_retirada" in m["movement_types"]


def test_seed_present():
    prods = S.get(f"{API}/products").json()
    assert len(prods) >= 8
    assert any("Combo" in c["name"] for c in S.get(f"{API}/combos").json())


# Product cost composition
def test_product_cost_breakdown():
    p = mk_product(name="TEST_Breakdown")
    # unit = 2+0.5+0.3+0.2 + 10*(11)/100 = 4.1
    assert approx(p["unit_cost_total"], 4.1)
    assert approx(p["contribution"], 5.9)
    assert approx(p["contribution_margin"], 59.0)
    assert approx(p["sales_margin"], 80.0)
    # suggested = 3.0 / (1 - 0.41) = 5.0847
    assert approx(p["suggested_price"], 5.08)
    assert p["stock"] == 50
    g = get_product(p["id"])
    assert approx(g["unit_cost_total"], 4.1) and g["packaging"] == 0.5


def test_product_suggested_infeasible_and_update():
    p = mk_product(name="TEST_Infeasible", card_fee_pct=40, tax_pct=30, target_margin_pct=30, initial_stock=0)
    assert p["suggested_price"] is None
    body = {k: p[k] for k in ["name", "category", "cost", "price", "unit", "min_stock", "packaging", "freight", "extra_costs", "card_fee_pct", "tax_pct", "target_margin_pct"]}
    body.update(card_fee_pct=0, tax_pct=0, packaging=0, freight=0, extra_costs=0, name="TEST_Infeasible_upd")
    r = S.put(f"{API}/products/{p['id']}", json=body)
    assert r.status_code == 200
    g = get_product(p["id"])
    assert g["name"] == "TEST_Infeasible_upd" and approx(g["unit_cost_total"], 2.0)


def test_product_validation():
    assert S.post(f"{API}/products", json={"name": "", "category": "Salgados", "cost": 1, "price": 2}).status_code == 422
    assert S.post(f"{API}/products", json={"name": "TEST_x", "category": "Salgados", "cost": -1, "price": 2}).status_code == 422


# Combo cost composition + sale
def test_combo_cost_and_sale_flow():
    a = mk_product(name="TEST_CompA", cost=1.0, price=4.0, packaging=0, freight=0, extra_costs=0, card_fee_pct=0, tax_pct=0, initial_stock=20)
    b = mk_product(name="TEST_CompB", cost=3.0, price=6.0, packaging=0, freight=0, extra_costs=0, card_fee_pct=0, tax_pct=0, initial_stock=5)
    r = S.post(f"{API}/combos", json={"name": "TEST_Combo", "price": 20.0, "items": [{"product_id": a["id"], "qty": 3}, {"product_id": b["id"], "qty": 1}],
                                       "packaging": 1.0, "card_fee_pct": 5, "tax_pct": 5, "target_margin_pct": 30})
    assert r.status_code == 200, r.text
    c = r.json()
    CREATED["combos"].append(c["id"])
    # base = 3*1 + 3 = 6 ; total = 6 + 1 + 20*10% = 9
    assert approx(c["merch_cost"], 6.0) and approx(c["unit_cost_total"], 9.0) and approx(c["contribution"], 11.0)
    assert approx(c["suggested_price"], 7.0 / 0.6)

    # sale with product + combo
    r = S.post(f"{API}/sales", json={"items": [{"type": "combo", "ref_id": c["id"], "qty": 2}, {"type": "product", "ref_id": a["id"], "qty": 1}]})
    assert r.status_code == 200, r.text
    sale = r.json()
    CREATED["sales"].append(sale["id"])
    assert len(sale["items"]) == 2 and sale["status"] == "ativa"
    assert approx(sale["total"], 44.0)
    assert approx(sale["cost_total"], 9.0 * 2 + 1.0)
    assert get_product(a["id"])["stock"] == 13 and get_product(b["id"])["stock"] == 3

    # insufficient stock blocked
    r = S.post(f"{API}/sales", json={"items": [{"type": "combo", "ref_id": c["id"], "qty": 4}]})
    assert r.status_code == 400 and "insuficiente" in r.json()["detail"]
    assert get_product(b["id"])["stock"] == 3

    # cancel -> stock restored, status cancelada, estorno movements
    r = S.post(f"{API}/sales/{sale['id']}/cancel", json={"reason": "TEST"})
    assert r.status_code == 200
    CREATED["sales"].remove(sale["id"])
    assert get_product(a["id"])["stock"] == 20 and get_product(b["id"])["stock"] == 5
    s2 = next(s for s in S.get(f"{API}/sales").json() if s["id"] == sale["id"])
    assert s2["status"] == "cancelada"
    est = S.get(f"{API}/stock/movements", params={"product_id": a["id"], "type": "estorno"}).json()
    assert len(est) == 1 and est[0]["qty"] == 7
    assert S.post(f"{API}/sales/{sale['id']}/cancel", json={"reason": "again"}).status_code == 400
    # deleting a combo component blocked
    assert S.delete(f"{API}/products/{a['id']}").status_code == 400


def test_sale_counts_once_and_revenue_delta():
    d = today()
    before = S.get(f"{API}/adm", params={"start": d, "end": d}).json()
    p = mk_product(name="TEST_Rev", cost=2.0, price=10.0, initial_stock=10)
    r = S.post(f"{API}/sales", json={"items": [{"type": "product", "ref_id": p["id"], "qty": 3}]})
    sale = r.json()
    CREATED["sales"].append(sale["id"])
    assert approx(sale["cost_total"], 4.1 * 3)
    after = S.get(f"{API}/adm", params={"start": d, "end": d}).json()
    assert approx(after["revenue"] - before["revenue"], 30.0)
    assert approx(after["cmv"] - before["cmv"], 12.3)
    assert after["sales_count"] - before["sales_count"] == 1
    S.post(f"{API}/sales/{sale['id']}/cancel", json={"reason": "TEST"})
    CREATED["sales"].remove(sale["id"])
    again = S.get(f"{API}/adm", params={"start": d, "end": d}).json()
    assert approx(again["revenue"], before["revenue"])


# Stock movements
def test_stock_entry_weighted_avg_and_expense():
    p = mk_product(name="TEST_Stock", cost=2.0, price=10.0, initial_stock=10)
    r = S.post(f"{API}/stock/movements", json={"product_id": p["id"], "type": "entrada", "qty": 10, "unit_cost": 4.0, "register_expense": True})
    assert r.status_code == 200
    g = get_product(p["id"])
    assert g["stock"] == 20 and approx(g["cost"], 3.0)
    exps = [e for e in S.get(f"{API}/expenses").json() if e["description"].startswith("Compra: TEST_Stock")]
    assert len(exps) == 1 and exps[0]["category"] == "Mercadorias" and approx(exps[0]["amount"], 40.0)
    CREATED["expenses"].append(exps[0]["id"])
    # ajuste via counted
    r = S.post(f"{API}/stock/movements", json={"product_id": p["id"], "type": "ajuste", "counted": 15})
    assert r.status_code == 200 and r.json()["delta"] == -5
    assert get_product(p["id"])["stock"] == 15
    # perda over stock blocked
    assert S.post(f"{API}/stock/movements", json={"product_id": p["id"], "type": "perda", "qty": 100}).status_code == 400


def test_losses_deducted_and_mercadorias_excluded():
    d = today()
    before = S.get(f"{API}/adm", params={"start": d, "end": d}).json()
    p = mk_product(name="TEST_Loss", cost=0.5, price=3.0, initial_stock=4, packaging=0, freight=0, extra_costs=0, card_fee_pct=0, tax_pct=0)
    assert S.post(f"{API}/stock/movements", json={"product_id": p["id"], "type": "vencido", "qty": 2}).status_code == 200
    e = S.post(f"{API}/expenses", json={"description": "TEST_merc", "category": "Mercadorias", "amount": 50, "date": d}).json()
    CREATED["expenses"].append(e["id"])
    after = S.get(f"{API}/adm", params={"start": d, "end": d}).json()
    assert approx(after["losses"] - before["losses"], 1.0)
    assert approx(after["op_expenses"], before["op_expenses"])
    assert approx(after["purchases"] - before["purchases"], 50)
    assert approx(after["op_result"] - before["op_result"], -1.0)


# Distribution rules
def test_distribution_rules():
    d = today()
    x = S.get(f"{API}/adm", params={"start": d, "end": d}).json()
    dist = x["distribution"]
    op = x["op_result"]
    if op > 0:
        assert dist["allowed"] is True
        assert approx(dist["pro_labore"], op * 0.2)
        assert approx(dist["tithe"], dist["pro_labore"] * 0.1)
        assert approx(dist["reserve"], op * 0.1) and approx(dist["investment"], op * 0.06)
        assert approx(dist["remaining_profit"], op - dist["pro_labore"] - dist["reserve"] - dist["investment"], 0.03)
    else:
        assert dist["allowed"] is False and dist["pro_labore"] == 0
    info = [i for i in dist["items"] if i["mode"] == "informativo"]
    assert approx(info[0]["value"], x["revenue"] * 0.3)


def test_distribution_blocked_period():
    r = S.get(f"{API}/adm", params={"start": "2001-01-01", "end": "2001-01-31"}).json()
    assert r["revenue"] == 0 and r["distribution"]["allowed"] is False and r["distribution"]["pro_labore"] == 0


# Expenses edit/cancel
def test_expense_edit_history_and_cancel():
    d = today()
    e = S.post(f"{API}/expenses", json={"description": "TEST_luz", "category": "Despesas fixas", "amount": 100, "date": d}).json()
    CREATED["expenses"].append(e["id"])
    r = S.put(f"{API}/expenses/{e['id']}", json={"description": "TEST_luz2", "category": "Despesas fixas", "amount": 120, "date": d})
    assert r.status_code == 200 and r.json()["amount"] == 120 and len(r.json()["history"]) == 1 and r.json()["history"][0]["amount"] == 100
    assert S.post(f"{API}/expenses", json={"description": "x", "category": "Invalida", "amount": 1, "date": d}).status_code == 400
    assert S.post(f"{API}/expenses/{e['id']}/cancel", json={"reason": "TEST"}).status_code == 200
    CREATED["expenses"].remove(e["id"])
    g = next(x for x in S.get(f"{API}/expenses").json() if x["id"] == e["id"])
    assert g["status"] == "cancelado"
    assert S.put(f"{API}/expenses/{e['id']}", json={"description": "y", "category": "Outros", "amount": 1, "date": d}).status_code == 400


# Movements / reserve / cash
def test_movements_reserve_and_cash():
    d = today()
    b0 = S.get(f"{API}/finance", params={"start": d, "end": d}).json()["balances"]
    dep = S.post(f"{API}/movements", json={"type": "reserva_deposito", "amount": 10, "date": d, "note": "TEST"}).json()
    CREATED["movements"].append(dep["id"])
    b1 = S.get(f"{API}/finance", params={"start": d, "end": d}).json()["balances"]
    assert approx(b1["reserve"] - b0["reserve"], 10) and approx(b1["cash"] - b0["cash"], -10)
    r = S.post(f"{API}/movements", json={"type": "reserva_retirada", "amount": b1["reserve"] + 100, "date": d})
    assert r.status_code == 400
    w = S.post(f"{API}/movements", json={"type": "reserva_retirada", "amount": 4, "date": d, "note": "TEST"})
    assert w.status_code == 200
    CREATED["movements"].append(w.json()["id"])
    r = S.put(f"{API}/movements/{dep['id']}", json={"type": "reserva_deposito", "amount": 15, "date": d, "note": "TEST"})
    assert r.status_code == 200 and len(r.json()["history"]) == 1
    assert S.post(f"{API}/movements", json={"type": "bogus", "amount": 1, "date": d}).status_code == 400


# Settings
def test_settings_roundtrip():
    s = S.get(f"{API}/settings").json()
    body = {k: s[k] for k in ["company_name", "tithe_pct", "opening_cash", "allow_negative_stock", "default_min_stock", "distribution"]}
    r = S.put(f"{API}/settings", json=body)
    assert r.status_code == 200 and r.json()["tithe_pct"] == s["tithe_pct"]


# Reports / finance / dashboard
def test_reports_finance_dashboard():
    d = today()
    assert "top_products" in S.get(f"{API}/reports", params={"start": d, "end": d}).json()
    f = S.get(f"{API}/finance", params={"start": d, "end": d}).json()
    assert "net_cash_flow" in f["totals"]
    db_ = S.get(f"{API}/dashboard").json()
    assert "balances" in db_ and "series" in db_


# Backup (non-destructive)
def test_backup_export_snapshot_and_reset_guard():
    b = S.get(f"{API}/backup").json()
    assert b["app"] == "ht-salgados" and "products" in b["data"]
    assert S.post(f"{API}/backup/restore", json={"app": "other"}).status_code == 400
    assert S.post(f"{API}/backup/reset", json={"confirm": "nope"}).status_code == 400
    snap = S.post(f"{API}/backup/snapshots").json()
    assert snap["reason"] == "Manual" and "data" not in snap
    assert any(x["id"] == snap["id"] for x in S.get(f"{API}/backup/snapshots").json())
