import { useEffect, useState } from 'react'
import { createOrGetSession, resetSession, startGame, upsertQuestions } from '../api'

import { useEventFeed } from '../hooks/useEventFeed'
import type { Player, Question, ServerEvent } from '../types'
const DEFAULT_SESSION = 'demo'
function emptyQ(id: string): Question {
  return {
    id, text: '', options: ['',
      '', '', ''], correct_index: 0
  }
}
export default function AdminPage() {
  const [sessionId, setSessionId] = useState(DEFAULT_SESSION)
  const [adminKey, setAdminKey] = useState('')
  const [players, setPlayers] = useState<Player[]>([])

  const [questions, setQuestions] = useState<Question[]>([emptyQ('q1')])
  const [bonus, setBonus] = useState<Question>(emptyQ('bonus'))
  const [status, setStatus] = useState<string>('')
  useEffect(() => {
    (async () => {
      const s = await createOrGetSession(sessionId);
      // s includes the current players list
      setPlayers(s.players);
    })();
  }, [sessionId]);
  useEventFeed(sessionId, (evt: ServerEvent) => {

    if (evt.type === 'session_reset') {
      setPlayers([])
      return
    }

    if (evt.type === 'players_update') setPlayers(evt.players)
  })
  const saveQuestions = async () => {
    // simple validation
    const valid = questions.every(q => q.text.trim() &&
      q.options.every(o => o.trim())) && bonus.text.trim() &&
      bonus.options.every(o => o.trim())
    if (!valid) {
      setStatus('Please fill all question texts and options.');
      return
    }
    try {
      await upsertQuestions(sessionId, questions, bonus, adminKey)
      setStatus('Questions saved.')
    } catch (e) {
      setStatus('Failed to save questions — check admin key.')
    }
  }
  const canStart = players.length >= 3 && questions.length > 0 &&
    questions.every(q => q.text && q.options.every(Boolean)) && bonus.text &&
    bonus.options.every(Boolean)
  const onStart = async () => {
    try { await startGame(sessionId, adminKey); setStatus('Game started!') }
    catch { setStatus('Start failed — check admin key and requirements.') }
  }
  const onReset = async () => {
    try {
      await resetSession(sessionId, adminKey)
      setPlayers([])
      setStatus('Session reset.')
    } catch {
      setStatus('Reset failed — check admin key.')
    }
  }
  const addQuestion = () => setQuestions(prev => [...prev, emptyQ('q' +
    (prev.length + 1))])
  return (
    <div className="container">
      <div className="card">
        <h1>Admin · BetterKahoots</h1>
        <div className="grid" style={{
          gridTemplateColumns: '1fr 1fr',
          alignItems: 'end'
        }}>
          <label>Session ID
            <input className="input" value={sessionId}
              onChange={e => setSessionId(e.target.value)} />
          </label>
          <label>Admin Key
            <input className="input" value={adminKey}
              onChange={e => setAdminKey(e.target.value)} />
          </label>
        </div>

        <p>Players joined: <strong>{players.length}</strong></p>
        <h2>Questions</h2>
        {questions.map((q, idx) => (
          <div key={q.id} className="card" style={{ marginBottom: '1rem' }}>
            <label>Question {idx + 1}
              <input className="input" value={q.text} onChange={e => {
                const v = e.target.value;
                setQuestions(s => s.map(qq => qq.id === q.id ? { ...qq, text: v } : qq))
              }} />
            </label>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {q.options.map((opt, i) => (
                <label key={i}>Option {i + 1}
                  <input className="input" value={opt} onChange={e => {
                    const v = e.target.value;
                    setQuestions(s => s.map(qq => qq.id === q.id ? {
                      ...qq, options:
                        qq.options.map((oo, j) => j === i ? v : oo)
                    } : qq))
                  }} />
                </label>
              ))}
            </div>
            <label>Correct Index (0–3)
              <input className="input" type="number" min={0} max={3}
                value={q.correct_index} onChange={e => {
                  const v = parseInt(e.target.value || '0');
                  setQuestions(s => s.map(qq => qq.id === q.id ? { ...qq, correct_index: v } : qq))
                }} />
            </label>
          </div>
        ))}
        <button className="btn" onClick={addQuestion}>+ Add Question</button>
        <h2>Bonus (Tiebreaker)</h2>
        <div className="card">
          <label>Question
            <input className="input" value={bonus.text}
              onChange={e => setBonus({ ...bonus, text: e.target.value })} />
          </label>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {bonus.options.map((opt, i) => (
              <label key={i}>Option {i + 1}
                <input className="input" value={opt} onChange={e => {
                  const v = e.target.value; setBonus(b => ({
                    ...b, options:
                      b.options.map((oo, j) => j === i ? v : oo)
                  }))
                }} />
              </label>
            ))}
          </div>
          <label>Correct Index (0–3)
            <input className="input" type="number" min={0} max={3}
              value={bonus.correct_index} onChange={e => setBonus(b => ({
                ...b, correct_index:
                  parseInt(e.target.value || '0')
              }))} />
          </label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn" onClick={saveQuestions}>Save Questions</button>
          <button className="btn" onClick={onReset}>Reset Session</button>
          <button className="btn primary" onClick={onStart} disabled={! canStart}>Start Game</button>
        </div>
        <p>{status}</p>
        <p style={{ opacity: 0.8 }}><em>Start disabled until ≥3 players joined
          and all question fields (including bonus) are filled.</em></p>
      </div>
    </div>
  )
}
