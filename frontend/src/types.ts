export type Player = { id: string; username: string; score: number; is_tied_finalist?: boolean }
export type Question = { id: string; text: string; options: string[]; correct_index: number }


export type ServerEvent =
| { type: 'players_update'; players: Player[] }
| { type: 'question'; is_bonus: boolean; question: Question; question_index: number; total_questions: number; deadline_ts: number }
| { type: 'reveal'; question_id: string; correct_index: number; awards: Record<string, number> }
| { type: 'scoreboard'; duration: number; leaderboard: Player[] }
| { type: 'tiebreak_start'; finalist_ids: string[] }
| { type: 'game_over'; leaderboard: Player[] }
