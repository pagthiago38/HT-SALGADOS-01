# Edge probes (manual): reserve balance can go negative via cancel/edit; negative ajuste
import os, requests
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
S = requests.Session()
d = S.get(f"{API}/dashboard").json()["today"]["start"]
r0 = S.get(f"{API}/finance", params={"start": d, "end": d}).json()["balances"]["reserve"]
dep = S.post(f"{API}/movements", json={"type": "reserva_deposito", "amount": 10, "date": d, "note": "TEST"}).json()
w = S.post(f"{API}/movements", json={"type": "reserva_retirada", "amount": 10 + r0, "date": d, "note": "TEST"}).json()
e = S.put(f"{API}/movements/{dep['id']}", json={"type": "reserva_deposito", "amount": 1, "date": d, "note": "TEST"})
print("edit deposit down status", e.status_code)
c = S.post(f"{API}/movements/{dep['id']}/cancel", json={"reason": "TEST"})
print("cancel deposit status", c.status_code, "reserve now", S.get(f"{API}/finance", params={"start": d, "end": d}).json()["balances"]["reserve"])
S.post(f"{API}/movements/{w['id']}/cancel", json={"reason": "TEST cleanup"})
S.post(f"{API}/movements/{dep['id']}/cancel", json={"reason": "TEST cleanup"})
p = S.post(f"{API}/products", json={"name": "TEST_Edge", "category": "Outros", "cost": 1, "price": 2, "initial_stock": 0}).json()
a = S.post(f"{API}/stock/movements", json={"product_id": p["id"], "type": "ajuste", "counted": -5})
print("negative ajuste", a.status_code, a.text)
x = S.post(f"{API}/expenses", json={"description": "TEST_d", "category": "Outros", "amount": 1, "date": "not-a-date"})
print("bad date expense", x.status_code)
if x.status_code == 200:
    S.post(f"{API}/expenses/{x.json()['id']}/cancel", json={"reason": "TEST cleanup"})
S.delete(f"{API}/products/{p['id']}")
