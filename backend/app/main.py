from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import asyncio,json
from typing import Optional
from .db import settings, db
from .game import manager, controller
from .schemas import (
    CreateSessionIn, JoinIn, AdminUpsertQuestionsIn, StartGameIn, AnswerIn,
    PublicSessionOut
)
from .models import Session, Question, PublicSessionOut
from .events import bus

app = FastAPI(title="BetterKahoots API")

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _sse_format(event: dict) -> bytes:
    # SSE expects lines starting with "data:"
    return f"data: {json.dumps(event)}\n\n".encode("utf-8")

@app.get("/api/session/{session_id}/events")
async def sse_events(session_id: str, request: Request):
    """
    SSE stream; client listens with EventSource.
    """
    q = await bus.subscribe(session_id)

    async def event_generator():
        try:
            # Immediately send a snapshot so UI can render current state
            # (Optionally call your existing "create_or_get_session")
            # session = await get_or_create_session(session_id)
            # yield _sse_format({"type":"snapshot", "session": PublicSessionOut.from_model(session).dict()})
            while True:
                # client disconnected?
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield _sse_format(item)
                except asyncio.TimeoutError:
                    # keep-alive comment (prevents proxies from closing)
                    yield b": keep-alive\n\n"
        finally:
            bus.unsubscribe(session_id, q)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # for nginx buffering
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


def require_admin(x_admin_key: Optional[str] = Header(default=None)):
    if x_admin_key != settings.ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Invalid admin key")


@app.post("/api/session", response_model=PublicSessionOut)
async def create_or_get_session(payload: CreateSessionIn):
    sdoc = await db.sessions.find_one({"id": payload.session_id})
    s = Session(**sdoc) if sdoc else Session(id=payload.session_id)
    await db.sessions.update_one({"id": s.id}, {"$set": s.model_dump()}, upsert=True)
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


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(session_id, websocket)
    try:
        while True:
            _ = await websocket.receive_text()  # passive; we send server-push events
    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
