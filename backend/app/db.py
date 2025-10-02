from __future__ import annotations

import asyncio
import copy
from enum import Enum
from functools import lru_cache
from typing import Any, Dict, Iterator, List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ADMIN_KEY: str = "change-me"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:8080"
    CORS_ORIGIN_REGEX: Optional[str] = r"https://.*\\.azurestaticapps\\.net"
    AZURE_STORAGE_CONNECTION_STRING: Optional[str] = None
    AZURE_STORAGE_CONTAINER: str = "question-images"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


class ReturnDocument(str, Enum):
    BEFORE = "before"
    AFTER = "after"


class InMemoryCursor:
    def __init__(self, collection: "InMemoryCollection", query: Dict[str, Any]):
        self._collection = collection
        self._query = query or {}
        self._sort_key: Optional[str] = None
        self._sort_direction: int = 1
        self._limit: Optional[int] = None
        self._materialised: Optional[Iterator[Dict[str, Any]]] = None

    def sort(self, key: str, direction: int):
        self._sort_key = key
        self._sort_direction = direction
        return self

    def limit(self, limit: int):
        self._limit = limit
        return self

    async def _ensure_materialised(self):
        if self._materialised is not None:
            return

        docs = await self._collection._find_all(self._query)

        if self._sort_key is not None:
            reverse = self._sort_direction < 0
            docs.sort(key=lambda d: d.get(self._sort_key), reverse=reverse)

        if self._limit is not None:
            docs = docs[: self._limit]

        self._materialised = iter(docs)

    def __aiter__(self):
        return self

    async def __anext__(self):
        await self._ensure_materialised()
        assert self._materialised is not None
        try:
            return next(self._materialised)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class InMemoryCollection:
    def __init__(self):
        self._docs: List[Dict[str, Any]] = []
        self._lock = asyncio.Lock()

    async def _find_all(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        async with self._lock:
            return [copy.deepcopy(doc) for doc in self._docs if self._matches(doc, query)]

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        async with self._lock:
            for doc in self._docs:
                if self._matches(doc, query):
                    return copy.deepcopy(doc)
        return None

    def find(self, query: Dict[str, Any]):
        return InMemoryCursor(self, query)

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False):
        async with self._lock:
            for idx, doc in enumerate(self._docs):
                if self._matches(doc, query):
                    updated = self._apply_update(copy.deepcopy(doc), update)
                    self._docs[idx] = updated
                    return

            if upsert:
                new_doc = copy.deepcopy(query)
                new_doc = self._apply_update(new_doc, update)
                self._docs.append(new_doc)

    async def insert_one(self, document: Dict[str, Any]):
        async with self._lock:
            self._docs.append(copy.deepcopy(document))

    async def delete_many(self, query: Dict[str, Any]):
        async with self._lock:
            self._docs = [doc for doc in self._docs if not self._matches(doc, query)]

    async def find_one_and_update(
        self,
        query: Dict[str, Any],
        update: Dict[str, Any],
        *,
        upsert: bool = False,
        return_document: "ReturnDocument" = ReturnDocument.BEFORE,
    ) -> Optional[Dict[str, Any]]:
        async with self._lock:
            for idx, doc in enumerate(self._docs):
                if self._matches(doc, query):
                    original = copy.deepcopy(doc)
                    updated = self._apply_update(copy.deepcopy(doc), update)
                    self._docs[idx] = updated
                    return copy.deepcopy(updated if return_document == ReturnDocument.AFTER else original)

            if upsert:
                new_doc = copy.deepcopy(query)
                new_doc = self._apply_update(new_doc, update)
                self._docs.append(new_doc)
                if return_document == ReturnDocument.AFTER:
                    return copy.deepcopy(new_doc)
                return None

        return None

    def _apply_update(self, doc: Dict[str, Any], update: Dict[str, Any]) -> Dict[str, Any]:
        for op, payload in update.items():
            if op == "$set":
                for key, value in payload.items():
                    doc[key] = copy.deepcopy(value)
            elif op == "$inc":
                for key, value in payload.items():
                    current = doc.get(key, 0)
                    doc[key] = current + value
            else:  # pragma: no cover - only the above operators are used today
                raise ValueError(f"Unsupported update operator: {op}")
        return doc

    def _matches(self, doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
        for key, expected in (query or {}).items():
            actual = doc.get(key)
            if isinstance(expected, dict):
                if "$gt" in expected:
                    if actual is None or actual <= expected["$gt"]:
                        return False
                else:  # pragma: no cover - extend as new operators are required
                    raise ValueError(f"Unsupported query operator(s): {expected}")
            else:
                if actual != expected:
                    return False
        return True


class InMemoryDatabase:
    def __init__(self):
        self.sessions = InMemoryCollection()
        self.answers = InMemoryCollection()
        self.session_event_counters = InMemoryCollection()
        self.session_events = InMemoryCollection()


db: Any = InMemoryDatabase()

