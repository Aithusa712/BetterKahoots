from __future__ import annotations
import asyncio
from typing import Dict, List

from .db import db
from .events import event_store
from .models import Player, Question, Session
from .utils import now_ts, sort_leaderboard


class GameController:
    def __init__(self):
        self.locks: Dict[str, asyncio.Lock] = {}

    def _lock(self, session_id: str) -> asyncio.Lock:
        self.locks.setdefault(session_id, asyncio.Lock())
        return self.locks[session_id]

    async def get_session(self, session_id: str) -> Session | None:
        doc = await db.sessions.find_one({"id": session_id})
        return Session(**doc) if doc else None

    async def save_session(self, s: Session):
        await db.sessions.update_one(
            {"id": s.id},
            {"$set": s.model_dump()},
            upsert=True
        )

    async def join(self, session_id: str, username: str) -> Player:
        async with self._lock(session_id):
            s = await self.get_session(session_id)
            if not s:
                s = Session(id=session_id)

            pid = username.lower().replace(" ", "-")
            if any(p.id == pid for p in s.players):
                # disambiguate
                pid = f"{pid}-{len(s.players)+1}"

            p = Player(id=pid, username=username)
            s.players.append(p)
            await self.save_session(s)

            await self._publish_players(session_id, s.players)

            return p

    async def set_questions(self, session_id: str, questions: List[Question], bonus: Question):
        async with self._lock(session_id):
            s = await self.get_session(session_id) or Session(id=session_id)
            s.questions = questions
            s.bonus_question = bonus
            await self.save_session(s)

    async def start(self, session_id: str):
        async with self._lock(session_id):
            s = await self.get_session(session_id)
            if not s or len(s.players) < 3 or not s.questions or not s.bonus_question:
                raise ValueError("Cannot start: need >=3 players, questions and a bonus question")

            s.state = "playing"
            s.current_question_idx = 0
            await self.save_session(s)
            asyncio.create_task(self._run_question(session_id))

    async def _run_question(self, session_id: str, is_bonus: bool = False):
        QDUR, SDUR = (30, 5) if not is_bonus else (30, 5)
        s = await self.get_session(session_id)
        if not s:
            return

        q = s.bonus_question if is_bonus else s.questions[s.current_question_idx]
        deadline = now_ts() + QDUR
        s.question_deadline_ts = deadline
        s.state = "playing" if not is_bonus else "tiebreak"
        await self.save_session(s)

        await event_store.append(
            session_id,
            {
                "type": "question",
                "is_bonus": is_bonus,
                "question": q.model_dump(),
                "question_index": s.current_question_idx,
                "total_questions": len(s.questions),
                "deadline_ts": deadline,
            },
        )

        # collect answers during window
        await asyncio.sleep(QDUR)

        # reveal + scoring
        await self._reveal_and_score(session_id, q, is_bonus)
        await asyncio.sleep(SDUR)

        if is_bonus:
            # bonus ends the game immediately
            await self._finish(session_id)
            return

        # move to next or finish
        async with self._lock(session_id):
            s = await self.get_session(session_id)
            if s.current_question_idx + 1 < len(s.questions):
                s.current_question_idx += 1
                await self.save_session(s)
                asyncio.create_task(self._run_question(session_id))
            else:
                await self._maybe_tiebreak_or_finish(session_id)

    async def submit_answer(self, session_id: str, player_id: str, question_id: str, option_index: int) -> bool:
        s = await self.get_session(session_id)
        if not s or s.state not in ("playing", "tiebreak"):
            return False

        # enforce deadline
        if s.question_deadline_ts and now_ts() > s.question_deadline_ts:
            return False

        q = s.bonus_question if s.state == "tiebreak" else s.questions[s.current_question_idx]
        if not q or q.id != question_id:
            return False

        is_correct = (option_index == q.correct_index)
        await db.answers.insert_one({
            "session_id": session_id,
            "player_id": player_id,
            "question_id": question_id,
            "option_index": option_index,
            "is_correct": is_correct,
            "timestamp": now_ts()
        })

        return is_correct

    async def _reveal_and_score(self, session_id: str, q: Question, is_bonus: bool):
        # fetch answers for this question
        answers = [a async for a in db.answers.find({"session_id": session_id, "question_id": q.id})]

        # order correct by earliest ts
        correct = [a for a in answers if a.get("is_correct")]
        correct.sort(key=lambda a: a["timestamp"])  # earliest first

        # bonuses for first 5 correct
        bonuses = [5, 4, 3, 2, 1]
        awards: dict[str, int] = {}
        for i, a in enumerate(correct[:5]):
            awards[a["player_id"]] = bonuses[i]

        # apply scores
        s = await self.get_session(session_id)
        if not s:
            return

        pid_to_player = {p.id: p for p in s.players}
        for pid, bonus in awards.items():
            if pid in pid_to_player:
                pid_to_player[pid].score += bonus

        await self.save_session(s)

        # broadcast reveal
        await event_store.append(
            session_id,
            {
                "type": "reveal",
                "question_id": q.id,
                "correct_index": q.correct_index,
                "awards": awards,
            },
        )

        # then scoreboard
        leaderboard = [p.model_dump() for p in sort_leaderboard([p.model_dump() for p in s.players])]
        await event_store.append(
            session_id,
            {
                "type": "scoreboard",
                "duration": 5,
                "leaderboard": leaderboard,
            },
        )
        await self._publish_players(session_id, s.players)

    async def _maybe_tiebreak_or_finish(self, session_id: str):
        s = await self.get_session(session_id)
        if not s:
            return

        players_sorted = sorted(s.players, key=lambda p: (-p.score, p.username.lower()))
        if not players_sorted:
            await self._finish(session_id)
            return

        top_score = players_sorted[0].score
        finalists = [p for p in players_sorted if p.score == top_score]
        if len(finalists) <= 1:
            await self._finish(session_id)
            return

        # mark finalists
        for p in s.players:
            p.is_tied_finalist = any(f.id == p.id for f in finalists)

        s.state = "tiebreak"
        await self.save_session(s)

        # run bonus question for finalists only
        await self._publish_players(session_id, s.players)
        await event_store.append(
            session_id,
            {
                "type": "tiebreak_start",
                "finalist_ids": [f.id for f in finalists],
            },
        )
        asyncio.create_task(self._run_question(session_id, is_bonus=True))

    async def _finish(self, session_id: str):
        s = await self.get_session(session_id)
        if not s:
            return

        s.state = "finished"
        await self.save_session(s)

        leaderboard = [p.model_dump() for p in sort_leaderboard([p.model_dump() for p in s.players])]
        await self._publish_players(session_id, s.players)
        await event_store.append(
            session_id,
            {
                "type": "game_over",
                "leaderboard": leaderboard,
            },
        )


    async def _publish_players(self, session_id: str, players: List[Player]):
        await event_store.append(
            session_id,
            {
                "type": "players_update",
                "players": [pl.model_dump() for pl in players],
            },
        )


controller = GameController()
