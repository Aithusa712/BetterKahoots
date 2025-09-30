from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from .db import db, settings
from .events import event_store
from .game import controller
from .models import Session
from .schemas import (
    AdminUpsertQuestionsIn,
    AnswerIn,
    CreateSessionIn,
    JoinIn,
    PublicSessionOut,
    StartGameIn,
)

app = FastAPI(title="BetterKahoots API")

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/session/{session_id}/events")
async def list_events(session_id: str, after: int | None = None, limit: int = 200):
    events = await event_store.list(session_id, after=after, limit=limit)
    latest_seq = events[-1]["seq"] if events else after
    return {"events": events, "latest_seq": latest_seq}


def require_admin(x_admin_key: Optional[str] = Header(default=None)):
    if x_admin_key != settings.ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Invalid admin key")


@app.post("/api/session", response_model=PublicSessionOut)
async def create_or_get_session(payload: CreateSessionIn):
    sdoc = await db.sessions.find_one({"id": payload.session_id})
    is_new = sdoc is None
    s = Session(**sdoc) if sdoc else Session(id=payload.session_id)
    await db.sessions.update_one({"id": s.id}, {"$set": s.model_dump()}, upsert=True)
    if is_new:
        await event_store.reset(s.id)
    return PublicSessionOut(
        id=s.id,
        state=s.state,
        players=s.players,
        current_question_idx=s.current_question_idx,
        question_deadline_ts=s.question_deadline_ts,
    )


@app.get("/api/session/{session_id}", response_model=PublicSessionOut)
async def get_session(session_id: str):
    s = await controller.get_session(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return PublicSessionOut(
        id=s.id,
        state=s.state,
        players=s.players,
        current_question_idx=s.current_question_idx,
        question_deadline_ts=s.question_deadline_ts,
    )


@app.post("/api/join")
async def join(payload: JoinIn):
    p = await controller.join(payload.session_id, payload.username)
    return {"player": p.model_dump()}


@app.post("/api/admin/questions")
async def upsert_questions(payload: AdminUpsertQuestionsIn, _: None = Depends(require_admin)):
    await controller.set_questions(payload.session_id, payload.questions, payload.bonus_question)
    return {"ok": True}


@app.post("/api/admin/start")
async def start(payload: StartGameIn, _: None = Depends(require_admin)):
    await controller.start(payload.session_id)
    return {"ok": True}


@app.post("/api/answer")
async def answer(payload: AnswerIn):
    ok = await controller.submit_answer(payload.session_id, payload.player_id, payload.question_id, payload.option_index)
    return {"accepted": ok}


