# Cleanup for UI-created TEST_ data (cancel by id only, never by bulk filter)
import os, requests
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
S = requests.Session()
for s in S.get(f"{API}/sales").json():
    if s["status"] == "ativa" and all(i["name"].startswith("TEST_") for i in s["items"]):
        print("cancel sale", s["number"], S.post(f"{API}/sales/{s['id']}/cancel", json={"reason": "TEST cleanup"}).status_code)
for m in S.get(f"{API}/movements").json():
    if m["status"] == "ativo" and (m.get("note") or "").startswith("TEST"):
        print("cancel movement", m["type"], S.post(f"{API}/movements/{m['id']}/cancel", json={"reason": "TEST cleanup"}).status_code)
for e in S.get(f"{API}/expenses").json():
    if e["status"] == "ativo" and ("TEST_" in e["description"]):
        print("cancel expense", e["description"], S.post(f"{API}/expenses/{e['id']}/cancel", json={"reason": "TEST cleanup"}).status_code)
for c in S.get(f"{API}/combos").json():
    if c["name"].startswith("TEST_"):
        print("delete combo", c["name"], S.delete(f"{API}/combos/{c['id']}").status_code)
for p in S.get(f"{API}/products").json():
    if p["name"].startswith("TEST_"):
        print("delete product", p["name"], S.delete(f"{API}/products/{p['id']}").status_code)
