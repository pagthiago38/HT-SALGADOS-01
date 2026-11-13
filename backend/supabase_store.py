"""Small Mongo-like adapter backed by Supabase PostgREST and app_records.
All reads/writes use the authenticated user's JWT; RLS remains the final guard.
"""
from __future__ import annotations
import copy
import os
from contextvars import ContextVar
from typing import Any
import httpx

_current_user: ContextVar[str | None] = ContextVar("supabase_user_id", default=None)
_current_token: ContextVar[str | None] = ContextVar("supabase_access_token", default=None)


def set_request_identity(user_id: str | None, token: str | None):
    return (_current_user.set(user_id), _current_token.set(token))


def reset_request_identity(tokens):
    _current_user.reset(tokens[0]); _current_token.reset(tokens[1])


def _get_path(obj: dict, path: str):
    cur: Any = obj
    for part in path.split("."):
        if isinstance(cur, list):
            cur = [x.get(part) for x in cur if isinstance(x, dict)]
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _match_value(actual, expected):
    if isinstance(expected, dict):
        for op, value in expected.items():
            if op == "$gte" and not (actual is not None and actual >= value): return False
            if op == "$lte" and not (actual is not None and actual <= value): return False
            if op == "$gt" and not (actual is not None and actual > value): return False
            if op == "$lt" and not (actual is not None and actual < value): return False
            if op == "$ne" and actual == value: return False
            if op == "$in":
                values = actual if isinstance(actual, list) else [actual]
                if not any(v in value for v in values): return False
            if op == "$nin":
                values = actual if isinstance(actual, list) else [actual]
                if any(v in value for v in values): return False
            if op == "$exists" and ((actual is not None) != bool(value)): return False
        return True
    if isinstance(actual, list): return expected in actual
    return actual == expected


def _matches(doc, query):
    for key, expected in (query or {}).items():
        if key == "$or":
            if not any(_matches(doc, q) for q in expected): return False
        elif key == "$and":
            if not all(_matches(doc, q) for q in expected): return False
        elif not _match_value(_get_path(doc, key), expected):
            return False
    return True


def _project(doc, projection):
    if not projection: return copy.deepcopy(doc)
    includes = [k for k, v in projection.items() if v and k != "_id"]
    if includes:
        out = {}
        for key in includes:
            val = _get_path(doc, key)
            if val is not None: out[key] = val
        return out
    out = copy.deepcopy(doc)
    for key, val in projection.items():
        if not val:
            out.pop(key, None)
    return out


class Cursor:
    def __init__(self, loader): self.loader = loader; self.docs = None; self.transforms = []
    async def _ensure(self):
        if self.docs is None:
            self.docs = await self.loader()
            for fn in self.transforms: fn(self.docs)
        return self.docs
    def sort(self, key, direction=None):
        fields = key if isinstance(key, list) else [(key, direction or 1)]
        def apply(docs):
            for field, order in reversed(fields):
                docs.sort(key=lambda x: (_get_path(x, field) is None, _get_path(x, field)), reverse=order < 0)
        self.transforms.append(apply); return self
    def limit(self, n): self.transforms.append(lambda docs: docs.__setitem__(slice(None), docs[:n])); return self
    def skip(self, n): self.transforms.append(lambda docs: docs.__setitem__(slice(None), docs[n:])); return self
    async def to_list(self, length=None):
        docs = await self._ensure(); return docs if length is None else docs[:length]
    def __aiter__(self): self._iterator = self._iterate(); return self
    async def _iterate(self):
        for item in await self._ensure(): yield item
    async def __anext__(self): return await self._iterator.__anext__()


class Collection:
    def __init__(self, name): self.name = name
    def _identity(self):
        uid, token = _current_user.get(), _current_token.get()
        if not uid or not token: raise RuntimeError("Operação sem usuário autenticado")
        return uid, token
    def _base(self):
        url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/app_records"
        uid, token = self._identity()
        headers = {"apikey": os.environ["SUPABASE_ANON_KEY"], "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        params = {"owner_id": f"eq.{uid}", "collection": f"eq.{self.name}"}
        return url, headers, params, uid
    async def _request(self, method, params=None, json=None, headers_extra=None):
        url, headers, base, uid = self._base(); headers.update(headers_extra or {})
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.request(method, url, params={**base, **(params or {})}, json=json, headers=headers)
        if response.status_code >= 400:
            raise RuntimeError(f"Supabase {response.status_code}: {response.text[:500]}")
        return response.json() if response.content else None
    async def _all(self):
        all_rows = []
        start = 0
        while True:
            rows = await self._request("GET", {"select": "record_id,data", "order": "record_id.asc"}, headers_extra={"Range-Unit": "items", "Range": f"{start}-{start + 999}"})
            rows = rows or []
            all_rows.extend(rows)
            if len(rows) < 1000: break
            start += 1000
        return [r.get("data") or {} for r in all_rows]
    def find(self, query=None, projection=None):
        async def load():
            return [_project(d, projection) for d in await self._all() if _matches(d, query or {})]
        return Cursor(load)
    async def find_one(self, query=None, projection=None):
        rows = self.find(query, projection)
        docs = await rows.to_list(1)
        return docs[0] if docs else None
    async def insert_one(self, doc):
        uid, _ = self._identity(); record_id = str(doc.get("id") or doc.get("_id") or "")
        if not record_id: raise RuntimeError("Registro precisa ter id")
        payload = {"owner_id": uid, "collection": self.name, "record_id": record_id, "data": doc}
        await self._request("POST", {"on_conflict": "owner_id,collection,record_id"}, payload, {"Prefer": "resolution=merge-duplicates,return=minimal"})
        return {"inserted_id": record_id}
    async def update_one(self, query, update, upsert=False):
        doc = await self.find_one(query)
        if doc is None:
            if not upsert: return {"matched_count": 0, "modified_count": 0}
            doc = {k: v for k, v in query.items() if not isinstance(v, dict)}
        new = copy.deepcopy(doc)
        for key, value in update.get("$set", {}).items(): new[key] = value
        for key, value in update.get("$inc", {}).items(): new[key] = (new.get(key) or 0) + value
        for key, value in update.get("$push", {}).items(): new.setdefault(key, []).append(value)
        for key, value in update.items():
            if not key.startswith("$"): new[key] = value
        await self.insert_one(new)
        return {"matched_count": 1 if doc else 0, "modified_count": 1, "upserted_id": new.get("id") if not doc else None}
    async def find_one_and_update(self, query, update, upsert=False, return_document=True):
        doc = await self.find_one(query)
        before = copy.deepcopy(doc) if doc else None
        if doc is None and upsert: doc = {k:v for k,v in query.items() if not isinstance(v,dict)}
        if doc is None: return None
        for key, value in update.get("$set", {}).items(): doc[key] = value
        for key, value in update.get("$inc", {}).items(): doc[key] = (doc.get(key) or 0) + value
        await self.insert_one(doc)
        return doc if return_document else before
    async def delete_many(self, query):
        docs = [d for d in await self._all() if _matches(d, query or {})]
        for doc in docs:
            await self._request("DELETE", {"record_id": f"eq.{doc.get('id')}"})
        return {"deleted_count": len(docs)}
    def aggregate(self, pipeline):
        async def load():
            docs = await self._all()
            for stage in pipeline:
                if "$match" in stage: docs = [d for d in docs if _matches(d, stage["$match"])]
                elif "$group" in stage:
                    spec = stage["$group"]; row = {"_id": spec.get("_id")}
                    for key, expr in spec.items():
                        if key == "_id": continue
                        if "$sum" in expr:
                            field = expr["$sum"].lstrip("$")
                            row[key] = sum((_get_path(d, field) or 0) for d in docs)
                    docs = [row] if docs else []
            return docs
        return Cursor(load)


class Database:
    def __getitem__(self, name): return Collection(name)
    def __getattr__(self, name): return Collection(name)


db = Database()
