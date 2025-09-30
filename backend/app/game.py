from __future__ import annotations
import asyncio
from typing import Dict, List

from .db import db
from .events import event_store
from .models import Player, Question, Session
from .utils import now_ts, sort_leaderboard


CORRECT_BASE_POINTS = 10
BONUS_POINTS = [5, 4, 3, 2, 1]


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

            if len(s.players) >= 30:
                raise ValueError("Session is full (30 players max)")

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

            # Reset per-game state so subsequent runs start from a clean slate.
            for p in s.players:
                p.score = 0
                p.is_tied_finalist = False

            s.state = "playing"
            s.current_question_idx = 0
            s.question_deadline_ts = None

            # Drop historical answers and event history for the new game.
            await db.answers.delete_many({"session_id": session_id})
            await event_store.reset(session_id)

            await self.save_session(s)

            # Broadcast the fresh lobby state so players see zeroed scores.
            await self._publish_players(session_id, s.players)
            asyncio.create_task(self._run_question(session_id))

    async def reset(self, session_id: str):
        async with self._lock(session_id):
            s = await self.get_session(session_id) or Session(id=session_id)

            # Clear any stored answers and return the session to an idle lobby state.
            await db.answers.delete_many({"session_id": session_id})

            s.state = "lobby"
            s.current_question_idx = -1
            s.question_deadline_ts = None
            s.players = []

            await self.save_session(s)

            # Reset the event log so clients drop derived state.
            await event_store.reset(session_id)

            # Publish the empty roster so admin/player views refresh immediately.
            await self._publish_players(session_id, [])

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

        # only finalists may answer during the tiebreak round
        if s.state == "tiebreak":
            finalist_ids = [p.id for p in s.players if p.is_tied_finalist]
            if player_id not in finalist_ids:
                return False

        existing = await db.answers.find_one({
            "session_id": session_id,
            "player_id": player_id,
            "question_id": question_id,
        })
        if existing:
            return False

        is_correct = (option_index == q.correct_index)
        ts = now_ts()
        await db.answers.insert_one({
            "session_id": session_id,
            "player_id": player_id,
            "question_id": question_id,
            "option_index": option_index,
            "is_correct": is_correct,
            "timestamp": ts
        })

        return is_correct

    async def _reveal_and_score(self, session_id: str, q: Question, is_bonus: bool):
        # fetch answers for this question
        answers = [a async for a in db.answers.find({"session_id": session_id, "question_id": q.id})]

        # order correct by earliest ts
        correct = [a for a in answers if a.get("is_correct")]
        correct.sort(key=lambda a: a["timestamp"])  # earliest first

        awards: dict[str, int] = {}

        # base points for everyone answering correctly
        for ans in correct:
            pid = ans["player_id"]
            awards[pid] = awards.get(pid, 0) + CORRECT_BASE_POINTS

        # bonuses for the first 5 correct answers
        for i, ans in enumerate(correct[:5]):
            pid = ans["player_id"]
            awards[pid] = awards.get(pid, 0) + BONUS_POINTS[i]

        # apply scores
        s = await self.get_session(session_id)
        if not s:
            return

        pid_to_player = {p.id: p for p in s.players}
        for pid, bonus in awards.items():
            if pid in pid_to_player:
                pid_to_player[pid].score += bonus

        # mark the session state so late joiners pick up the reveal
        s.state = "reveal"
        s.question_deadline_ts = None
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
        players_data = [p.model_dump() for p in s.players]
        leaderboard = sort_leaderboard(players_data)
        s.state = "scoreboard"
        await self.save_session(s)
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
        for p in s.players:
            p.is_tied_finalist = False
        await self.save_session(s)

        leaderboard = sort_leaderboard([p.model_dump() for p in s.players])
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
