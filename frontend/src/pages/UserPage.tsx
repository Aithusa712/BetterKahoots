import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Backdrop,
  CircularProgress,
  Fade,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import { useNavigate } from 'react-router-dom'
import { createOrGetSession, join, submitAnswer, verifyAdminKey } from '../api'
import { useEventFeed } from '../hooks/useEventFeed'
import TimerBar from '../components/TimerBar'
import AnswerButtons from '../components/AnswerButtons'
import Leaderboard from '../components/Leaderboard'
import type { ServerEvent, Player, Question } from '../types'
import { ADMIN_KEY_STORAGE_KEY } from '../constants'


const DEFAULT_SESSION = 'demo'


type ScoreboardState = {
  players: Player[]
  duration: number
  startedAt: number
  title: string
  subtitle?: string
  autoClose: boolean
}


export default function UserPage() {
  const theme = useTheme()
  const navigate = useNavigate()
  const [sessionId, setSessionId] = useState<string>(DEFAULT_SESSION)
  const [username, setUsername] = useState('')
  const [player, setPlayer] = useState<Player | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [question, setQuestion] = useState<Question | null>(null)
  const [deadlineTs, setDeadlineTs] = useState<number | null>(null)
  const [revealIndex, setRevealIndex] = useState<number | null>(null)
  const [scoreboardState, setScoreboardState] = useState<ScoreboardState | null>(null)
  const [finalists, setFinalists] = useState<string[] | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [leaderboardCountdown, setLeaderboardCountdown] = useState<number>(0)
  const [leaderboardPendingMessage, setLeaderboardPendingMessage] = useState<string | null>(null)
  const [correctAnswerMessage, setCorrectAnswerMessage] = useState<string | null>(null)
  const scoreboardTimeoutRef = useRef<number | null>(null)
  const correctAnswerTimerRef = useRef<number | null>(null)
  const [adminDialogOpen, setAdminDialogOpen] = useState(false)
  const [adminKeyInput, setAdminKeyInput] = useState('')
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminSubmitting, setAdminSubmitting] = useState(false)


  useEffect(() => { createOrGetSession(sessionId) }, [sessionId])


  const onEvent = (evt: ServerEvent) => {
    if (evt.type === 'session_reset') {
      setPlayers(prev => prev.map(p => ({ ...p, score: 0, is_tied_finalist: false })))
      setQuestion(null)
      setDeadlineTs(null)
      setRevealIndex(null)
      setScoreboardState(null)
      setFinalists(null)
      setSelectedIndex(null)
      setLeaderboardCountdown(0)
      setLeaderboardPendingMessage(null)
      setCorrectAnswerMessage(null)
      if (scoreboardTimeoutRef.current) {
        window.clearTimeout(scoreboardTimeoutRef.current)
        scoreboardTimeoutRef.current = null
      }
      if (correctAnswerTimerRef.current) {
        window.clearTimeout(correctAnswerTimerRef.current)
        correctAnswerTimerRef.current = null
      }
      return
    }
    if (evt.type === 'players_update') setPlayers(evt.players)
    if (evt.type === 'question') {
      setQuestion(evt.question)
      setDeadlineTs(evt.deadline_ts)
      setRevealIndex(null)
      setScoreboardState(null)
      setSelectedIndex(null)
      setLeaderboardCountdown(0)
      setLeaderboardPendingMessage(null)
      setCorrectAnswerMessage(null)
      if (scoreboardTimeoutRef.current) {
        window.clearTimeout(scoreboardTimeoutRef.current)
        scoreboardTimeoutRef.current = null
      }
      if (correctAnswerTimerRef.current) {
        window.clearTimeout(correctAnswerTimerRef.current)
        correctAnswerTimerRef.current = null
      }
      if (!evt.is_bonus) setFinalists(null)
    }
    if (evt.type === 'reveal') {
      setRevealIndex(evt.correct_index)
      if (correctAnswerTimerRef.current) {
        window.clearTimeout(correctAnswerTimerRef.current)
      }
      const answerText = question?.options?.[evt.correct_index]
      setCorrectAnswerMessage(
        typeof answerText === 'string'
          ? `Correct answer: ${answerText}`
          : 'Time is up!'
      )
      correctAnswerTimerRef.current = window.setTimeout(() => {
        setCorrectAnswerMessage(null)
        correctAnswerTimerRef.current = null
      }, 2000)
    }
    if (evt.type === 'leaderboard_pending') {
      setLeaderboardPendingMessage(evt.message)
    }
    if (evt.type === 'scoreboard') {
      setLeaderboardPendingMessage(null)
      const startedAt = Date.now()
      setScoreboardState({
        players: evt.leaderboard,
        duration: evt.duration,
        startedAt,
        title: 'Leaderboard',
        subtitle: 'Round Results',
        autoClose: true,
      })
      setPlayers(evt.leaderboard)
      if (scoreboardTimeoutRef.current) {
        window.clearTimeout(scoreboardTimeoutRef.current)
      }
      scoreboardTimeoutRef.current = window.setTimeout(() => {
        setScoreboardState(null)
        setLeaderboardCountdown(0)
        scoreboardTimeoutRef.current = null
      }, evt.duration * 1000)
    }
    if (evt.type === 'tiebreak_start') setFinalists(evt.finalist_ids)
    if (evt.type === 'game_over') {
      setLeaderboardPendingMessage(null)
      setScoreboardState({
        players: evt.leaderboard,
        duration: 0,
        startedAt: Date.now(),
        title: 'Game Over',
        subtitle: 'Results:',
        autoClose: false,
      })
      setPlayers(evt.leaderboard)
      setSelectedIndex(null)
      if (scoreboardTimeoutRef.current) {
        window.clearTimeout(scoreboardTimeoutRef.current)
        scoreboardTimeoutRef.current = null
      }
    }
  }
  useEventFeed(sessionId, onEvent)


  useEffect(() => {
    if (!scoreboardState || scoreboardState.duration <= 0) {
      setLeaderboardCountdown(0)
      return
    }

    const endTime = scoreboardState.startedAt + scoreboardState.duration * 1000

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
      setLeaderboardCountdown(remaining)
      return remaining
    }

    updateCountdown()

    const interval = window.setInterval(() => {
      const remaining = updateCountdown()
      if (remaining <= 0) {
        window.clearInterval(interval)
      }
    }, 200)

    return () => {
      window.clearInterval(interval)
    }
  }, [scoreboardState])


  const canAnswer = useMemo(() => {
    if (!question || !deadlineTs) return false
    if (finalists && !finalists.includes(player?.id || '')) return false
    const beforeDeadline = Date.now() < deadlineTs * 1000
    return beforeDeadline && revealIndex === null && selectedIndex === null
  }, [question, deadlineTs, revealIndex, finalists, player, selectedIndex])


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

  const closeScoreboard = () => {
    if (scoreboardTimeoutRef.current) {
      window.clearTimeout(scoreboardTimeoutRef.current)
      scoreboardTimeoutRef.current = null
    }
    setScoreboardState(null)
    setLeaderboardCountdown(0)
  }

  const openAdminDialog = () => {
    if (typeof window !== 'undefined') {
      setAdminKeyInput(localStorage.getItem(ADMIN_KEY_STORAGE_KEY) ?? '')
    }
    setAdminError(null)
    setAdminDialogOpen(true)
  }

  const closeAdminDialog = () => {
    setAdminSubmitting(false)
    setAdminDialogOpen(false)
  }

  const handleAdminSubmit = async () => {
    const trimmedKey = adminKeyInput.trim()
    if (!trimmedKey) {
      setAdminError('Enter the secret key to continue.')
      return
    }
    setAdminSubmitting(true)
    setAdminError(null)
    try {
      await verifyAdminKey(trimmedKey)
      if (typeof window !== 'undefined') {
        localStorage.setItem(ADMIN_KEY_STORAGE_KEY, trimmedKey)
      }
      setAdminDialogOpen(false)
      navigate('/admin')
    } catch {
      setAdminError('That key didn\'t work. Try again.')
    } finally {
      setAdminSubmitting(false)
    }
  }

  useEffect(() => {
    return () => {
      if (scoreboardTimeoutRef.current) {
        window.clearTimeout(scoreboardTimeoutRef.current)
        scoreboardTimeoutRef.current = null
      }
      if (correctAnswerTimerRef.current) {
        window.clearTimeout(correctAnswerTimerRef.current)
        correctAnswerTimerRef.current = null
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
          className="glass-card"
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
              <Stack direction="row" spacing={1.5} alignItems="center">
                {player && (
                  <Chip
                    label={`Players: ${players.length}`}
                    color="secondary"
                    variant="outlined"
                    sx={{ fontWeight: 600 }}
                  />
                )}
                <Button variant="outlined" onClick={openAdminDialog}>
                  Admin
                </Button>
              </Stack>
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
                  <Stack
                    spacing={{ xs: 2, md: 3 }}
                    className="question-stage"
                    sx={{ alignItems: 'center' }}
                  >
                    {deadlineTs && (
                      <Box sx={{ width: '100%' }}>
                        <TimerBar deadlineTs={deadlineTs} />
                      </Box>
                    )}
                    {question.image_url && (
                      <Box
                        className="question-visual"
                        sx={{
                          width: '100%',
                          maxWidth: { xs: 440, md: 520 },
                          mx: 'auto',
                          aspectRatio: '1',
                          borderRadius: 3,
                          overflow: 'hidden',
                          boxShadow: `0 18px 40px -20px ${alpha(theme.palette.primary.main, 0.8)}`,
                          border: `1px solid ${alpha(theme.palette.primary.main, 0.35)}`,
                        }}
                      >
                        <Box
                          component="img"
                          src={question.image_url}
                          alt="Question visual"
                          sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'center',
                            display: 'block',
                          }}
                        />
                      </Box>
                    )}
                    <Typography variant="h5" fontWeight={700} textAlign="center">
                      {question.text}
                    </Typography>
                    {finalists && !finalists.includes(player.id) && (
                      <Alert severity="info" sx={{ width: '100%', alignSelf: 'center' }}>
                        Only finalists can answer the bonus question. Cheer them on!
                      </Alert>
                    )}
                    <Box sx={{ width: '100%' }}>
                      <AnswerButtons
                        options={question.options}
                        locked={!canAnswer}
                        revealIndex={revealIndex}
                        selectedIndex={selectedIndex}
                        onPick={pick}
                      />
                    </Box>
                    <Fade in={Boolean(correctAnswerMessage)} timeout={{ enter: 200, exit: 200 }}>
                      <Box sx={{ width: '100%' }}>
                        {correctAnswerMessage && (
                          <Alert severity="success" sx={{ borderRadius: 3 }}>
                            {correctAnswerMessage}
                          </Alert>
                        )}
                      </Box>
                    </Fade>
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
        open={Boolean(player && scoreboardState)}
        players={scoreboardState?.players ?? []}
        title={scoreboardState?.title}
        subtitle={scoreboardState?.subtitle}
        countdownSeconds={scoreboardState?.autoClose ? leaderboardCountdown : undefined}
        onClose={closeScoreboard}
      />
      <Backdrop
        open={Boolean(leaderboardPendingMessage)}
        sx={{
          color: '#fff',
          zIndex: theme.zIndex.modal - 1,
          backdropFilter: 'blur(4px)',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <CircularProgress color="inherit" thickness={4} />
        <Typography variant="h6" fontWeight={600}>
          {leaderboardPendingMessage ?? 'Preparing leaderboard…'}
        </Typography>
        <Typography variant="body2" color="rgba(255,255,255,0.7)">
          Waiting for other players
        </Typography>
      </Backdrop>
      <Dialog open={adminDialogOpen} onClose={closeAdminDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Admin Access</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Enter the secret admin key to manage the game.
            </Typography>
            <TextField
              label="Admin Key"
              type="password"
              value={adminKeyInput}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setAdminKeyInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleAdminSubmit()
                }
              }}
              fullWidth
              autoFocus
              disabled={adminSubmitting}
            />
            {adminError && <Alert severity="error">{adminError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={closeAdminDialog} disabled={adminSubmitting}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleAdminSubmit} disabled={adminSubmitting}>
            {adminSubmitting ? 'Verifying…' : 'Continue'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}
