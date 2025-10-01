import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import { createOrGetSession, join, submitAnswer } from '../api'
import { useEventFeed } from '../hooks/useEventFeed'
import TimerBar from '../components/TimerBar'
import AnswerButtons from '../components/AnswerButtons'
import Leaderboard from '../components/Leaderboard'
import type { ServerEvent, Player, Question } from '../types'


const DEFAULT_SESSION = 'demo'


export default function UserPage() {
  const theme = useTheme()
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


  const currentScore = player ? players.find(p => p.id === player.id)?.score ?? 0 : 0
  const isSpectator = finalists && player && !finalists.includes(player.id)


  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={{ xs: 3, md: 4 }}>
        <Paper
          elevation={8}
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 4,
            backgroundImage:
              'linear-gradient(160deg, rgba(203, 166, 247, 0.12), transparent 55%), linear-gradient(20deg, rgba(137, 220, 235, 0.08), transparent 50%)',
          }}
        >
          <Stack spacing={{ xs: 3, md: 4 }}>
            <Box display="flex" flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={1.5}>
              <Box>
                <Typography variant="h4" fontWeight={700} gutterBottom sx={{ mb: 0 }}>
                  BetterKahoots
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Session ID · {sessionId.toUpperCase()}
                </Typography>
              </Box>
              {player && (
                <Chip
                  label={`Players: ${players.length}`}
                  color="secondary"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
              )}
            </Box>

            {!player ? (
              <Stack spacing={2.5}>
                <Typography variant="body1" color="text.secondary">
                  Jump into the lobby with your username to start playing.
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    label="Session ID"
                    value={sessionId}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setSessionId(event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Username"
                    value={username}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setUsername(event.target.value)}
                    fullWidth
                    autoComplete="name"
                  />
                  <Button
                    variant="contained"
                    size="large"
                    onClick={doJoin}
                    sx={{ alignSelf: { xs: 'stretch', sm: 'start' } }}
                  >
                    Join Game
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Stack spacing={{ xs: 2.5, md: 3 }}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: { xs: 2, md: 2.5 },
                    borderRadius: 3,
                    backgroundColor: alpha(theme.palette.background.paper, 0.75),
                    borderColor: alpha(theme.palette.primary.main, 0.3),
                  }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                    <Typography variant="h6" fontWeight={700}>
                      Hi {player.username}!
                    </Typography>
                    <Chip
                      color="primary"
                      label={`Score · ${currentScore.toLocaleString()} pts`}
                      sx={{ fontWeight: 600 }}
                    />
                  </Stack>
                  {isSpectator && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      You made it to the finals! Sit tight while the tiebreaker plays out.
                    </Alert>
                  )}
                </Paper>

                <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.2)' }} />

                {question ? (
                  <Stack spacing={{ xs: 2, md: 3 }}>
                    {deadlineTs && <TimerBar deadlineTs={deadlineTs} />}
                    <Typography variant="h5" fontWeight={700}>
                      {question.text}
                    </Typography>
                    {finalists && !finalists.includes(player.id) && (
                      <Alert severity="info">
                        Only finalists can answer the bonus question. Cheer them on!
                      </Alert>
                    )}
                    <AnswerButtons
                      options={question.options}
                      locked={!canAnswer}
                      revealIndex={revealIndex}
                      selectedIndex={selectedIndex}
                      onPick={pick}
                    />
                  </Stack>
                ) : (
                  <Box
                    sx={{
                      py: { xs: 4, md: 6 },
                      textAlign: 'center',
                      borderRadius: 3,
                      border: `1px dashed ${alpha(theme.palette.secondary.main, 0.35)}`,
                      backgroundColor: alpha(theme.palette.secondary.main, 0.08),
                    }}
                  >
                    <Typography variant="h6" fontWeight={600} gutterBottom>
                      Waiting for the host…
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Once the game begins you’ll see the questions and timer right here.
                    </Typography>
                  </Box>
                )}
              </Stack>
            )}
          </Stack>
        </Paper>
      </Stack>

      <Leaderboard
        open={Boolean(player && scoreboard)}
        players={scoreboard ?? []}
        onClose={() => setScoreboard(null)}
      />
    </Container>
  )
}
