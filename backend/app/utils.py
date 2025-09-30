import time
from typing import Dict, Any

def now_ts() -> float:
    return time.time()

def sort_leaderboard(players: list[dict]) -> list[dict]:
    return sorted(players, key=lambda p: (-p.get("score",0), p["username"].lower()))
