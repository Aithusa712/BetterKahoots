
from pydantic import BaseModel
from typing import List, Optional
from .models import Question, Player, Session


class CreateSessionIn(BaseModel):
    session_id: str


class JoinIn(BaseModel):
    session_id: str
    username: str


class AdminUpsertQuestionsIn(BaseModel):
    session_id: str
    questions: List[Question]
    bonus_question: Question


class StartGameIn(BaseModel):
    session_id: str


class ResetSessionIn(BaseModel):
    session_id: str


class AnswerIn(BaseModel):
    session_id: str
    player_id: str
    question_id: str
    option_index: int


class PublicSessionOut(BaseModel):
    id: str
    state: str
    players: List[Player]
    current_question_idx: int
    question_deadline_ts: float | None

