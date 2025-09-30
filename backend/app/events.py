# backend/events.py
import asyncio
from typing import Dict, List

class SessionBus:
    def __init__(self):
        self._subs: Dict[str, List[asyncio.Queue]] = {}

    def _get_list(self, session_id: str) -> List[asyncio.Queue]:
        return self._subs.setdefault(session_id, [])

    async def publish(self, session_id: str, payload: dict):
        queues = list(self._get_list(session_id))
        for q in queues:
            # don't block publisher
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                pass

    async def subscribe(self, session_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._get_list(session_id).append(q)
        return q

    def unsubscribe(self, session_id: str, q: asyncio.Queue):
        lst = self._subs.get(session_id)
        if lst and q in lst:
            lst.remove(q)

bus = SessionBus()

