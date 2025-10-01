from __future__ import annotations

from typing import Any, List

from pymongo import ReturnDocument

from .db import db
from .utils import now_ts


class EventStore:
    """Persist session events so clients can poll via HTTP."""

    counters_collection = db.session_event_counters
    events_collection = db.session_events

    async def append(self, session_id: str, payload: dict[str, Any]) -> int:
        """Store a new event for a session and return its sequence number."""

        counter_doc = await self.counters_collection.find_one_and_update(
            {"_id": session_id},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )

        if not counter_doc:
            # Some Mongo-compatible providers (for example Azure Cosmos DB)
            # complete the upsert but return ``None`` instead of the updated
            # document. Fall back to a direct lookup so we still obtain the
            # sequence number.
            counter_doc = await self.counters_collection.find_one({"_id": session_id})

        if not counter_doc or "seq" not in counter_doc:
            # As a last resort ensure a counter document exists so we can
            # continue emitting events without crashing the request handler.
            counter_doc = {"seq": 1}
            await self.counters_collection.update_one(
                {"_id": session_id},
                {"$set": counter_doc},
                upsert=True,
            )

        seq = int(counter_doc.get("seq", 1))

        await self.events_collection.insert_one(
            {
                "session_id": session_id,
                "seq": seq,
                "timestamp": now_ts(),
                "payload": payload,
            }
        )
        return seq

    async def list(self, session_id: str, after: int | None = None, limit: int = 200) -> List[dict[str, Any]]:
        """Return events for a session that occur after the given sequence."""

        query: dict[str, Any] = {"session_id": session_id}
        if after is not None:
            query["seq"] = {"$gt": after}

        cursor = (
            self.events_collection.find(query)
            .sort("seq", 1)
            .limit(limit)
        )

        events: List[dict[str, Any]] = []
        async for doc in cursor:
            events.append(
                {
                    "seq": doc["seq"],
                    "timestamp": doc.get("timestamp"),
                    "payload": doc.get("payload", {}),
                }
            )
        return events

    async def reset(self, session_id: str) -> None:

        """Clear stored events for a session and emit a reset marker."""

        await self.events_collection.delete_many({"session_id": session_id})

        # Ensure a counter document exists so sequence numbers keep increasing
        counter_doc = await self.counters_collection.find_one({"_id": session_id})
        if counter_doc is None:
            await self.counters_collection.insert_one({"_id": session_id, "seq": 0})

        # Emit a synthetic reset event so long-polling clients know to
        # discard any derived state from the previous game.
        await self.append(session_id, {"type": "session_reset"})


event_store = EventStore()

