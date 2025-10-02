from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime

AnswerIndex = int


class Answer(BaseModel):
    player_id: str
    question_id: str
    option_index: int
    is_correct: bool
    timestamp: float  # epoch seconds


class Player(BaseModel):
    id: str
    username: str
    score: int = 0
    is_tied_finalist: bool = False


class Question(BaseModel):
    id: str
    text: str
    options: List[str]
    correct_index: AnswerIndex
    image_url: Optional[str] = None


class SessionState(str):
    pass


# States: lobby -> playing -> reveal -> scoreboard -> finished -> tiebreak -> finished
class Session(BaseModel):
    id: str
    state: Literal["lobby", "playing", "reveal", "scoreboard", "tiebreak", "finished"] = "lobby"
    players: List[Player] = Field(default_factory=list)
    questions: List[Question] = Field(default_factory=list)
    bonus_question: Optional[Question] = None
    current_question_idx: int = -1
    question_deadline_ts: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

