import { useEffect, useMemo, useRef, useState } from 'react'
import { createOrGetSession, join, submitAnswer } from '../api'
import { useEventFeed } from '../hooks/useEventFeed'
import TimerBar from '../components/TimerBar'
import AnswerButtons from '../components/AnswerButtons'
import Leaderboard from '../components/Leaderboard'
import type { ServerEvent, Player, Question } from '../types'


const DEFAULT_SESSION = 'demo'


export default function UserPage() {
  const [sessionId, setSessionId] = useState<string>(DEFAULT_SESSION)
  const [username, setUsername] = useState('')
  const [player, setPlayer] = useState<Player | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [question, setQuestion] = useState<Question | null>(null)
  const [deadlineTs, setDeadlineTs] = useState<number | null>(null)
  const [revealIndex, setRevealIndex] = useState<number | null>(null)
  const [scoreboard, setScoreboard] = useState<Player[] | null>(null)
  const [finalists, setFinalists] = useState<string[] | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const scoreboardTimeoutRef = useRef<number | null>(null)


  useEffect(() => { createOrGetSession(sessionId) }, [sessionId])


  const onEvent = (evt: ServerEvent) => {

    if (evt.type === 'session_reset') {
      setPlayers(prev => prev.map(p => ({ ...p, score: 0, is_tied_finalist: false })))
      setQuestion(null)
      setDeadlineTs(null)
      setRevealIndex(null)
      setScoreboard(null)
      setFinalists(null)

      setSelectedIndex(null)
      if (scoreboardTimeoutRef.current) {
        window.clearTimeout(scoreboardTimeoutRef.current)
        scoreboardTimeoutRef.current = null
      }
      return
    }

    if (evt.type === 'players_update') setPlayers(evt.players)
    if (evt.type === 'question') {
      setQuestion(evt.question)
      setDeadlineTs(evt.deadline_ts)
      setRevealIndex(null)
      setScoreboard(null)

      setSelectedIndex(null)
      if (scoreboardTimeoutRef.current) {
        window.clearTimeout(scoreboardTimeoutRef.current)
        scoreboardTimeoutRef.current = null
      }

      if (!evt.is_bonus) setFinalists(null)
    }
    if (evt.type === 'reveal') {
      setRevealIndex(evt.correct_index)
    }
    if (evt.type === 'scoreboard') {
      setScoreboard(evt.leaderboard)
      setPlayers(evt.leaderboard)

      if (scoreboardTimeoutRef.current) {
        window.clearTimeout(scoreboardTimeoutRef.current)
      }
      scoreboardTimeoutRef.current = window.setTimeout(() => {
        setScoreboard(null)
        scoreboardTimeoutRef.current = null
      }, evt.duration * 1000)

    }
    if (evt.type === 'tiebreak_start') setFinalists(evt.finalist_ids)
    if (evt.type === 'game_over') {
      setScoreboard(evt.leaderboard)
      setPlayers(evt.leaderboard)

      setSelectedIndex(null)
      if (scoreboardTimeoutRef.current) {
        window.clearTimeout(scoreboardTimeoutRef.current)
        scoreboardTimeoutRef.current = null
      }

    }
  }
  useEventFeed(sessionId, onEvent)


  const canAnswer = useMemo(() => {
    if (!question || !deadlineTs) return false
    if (finalists && !finalists.includes(player?.id || '')) return false
    return Date.now() < deadlineTs * 1000 && revealIndex === null
  }, [question, deadlineTs, revealIndex, finalists, player])


  const doJoin = async () => {
    if (!username.trim()) return
    const res = await join(sessionId, username.trim())
    setPlayer(res.player)
  }


  const pick = async (i: number) => {
    if (!question || !player || !canAnswer) return
    setSelectedIndex(i)
    try { await submitAnswer(sessionId, player.id, question.id, i) } catch { }
  }

  useEffect(() => {
    return () => {
      if (scoreboardTimeoutRef.current) {
        window.clearTimeout(scoreboardTimeoutRef.current)
        scoreboardTimeoutRef.current = null
      }
    }
  }, [])


  return (
    <div className="container">
      <div className="card">
        <h1>BetterKahoots</h1>
        {!player ? (
          <div className="grid" style={{ maxWidth: 480 }}>
            <label>Session ID
              <input className="input" value={sessionId} onChange={e => setSessionId(e.target.value)} />
            </label>
            <label>Username
              <input className="input" value={username} onChange={e => setUsername(e.target.value)} />
            </label>
            <button className="btn primary" onClick={doJoin}>Join</button>
          </div>
        ) : (
          <div>
            <p>Hi, <strong>{player.username}</strong> — Score: {players.find(p => p.id === player.id)?.score ?? 0}</p>
            {question ? (
              <div>
                {deadlineTs && <TimerBar deadlineTs={deadlineTs} />}
                <h2>{question.text}</h2>
                <AnswerButtons
                  options={question.options}
                  locked={!canAnswer}
                  revealIndex={revealIndex}
                  selectedIndex={selectedIndex}
                  onPick={pick}
                />
              </div>
            ) : (
              <p>Waiting for the host to start…</p>
            )}
          </div>
        )}
      </div>


      {player && scoreboard && <Leaderboard players={scoreboard} />}
    </div>
  )
}
