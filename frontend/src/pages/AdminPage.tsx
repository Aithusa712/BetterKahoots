import { useEffect, useState, type ChangeEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import {
  createOrGetSession,
  resetSession,
  startGame,
  upsertQuestions,
  uploadQuestionImage,
} from '../api'
import { useEventFeed } from '../hooks/useEventFeed'
import type { Player, Question, ServerEvent } from '../types'
import { ADMIN_KEY_STORAGE_KEY } from '../constants'


const DEFAULT_SESSION = 'demo'


function emptyQ(id: string): Question {
  return { id, text: '', options: ['', '', '', ''], correct_index: 0, image_url: null }
}


type StatusMessage = { text: string; tone: 'success' | 'error' | 'info' }


export default function AdminPage() {
  const theme = useTheme()
  const [sessionId, setSessionId] = useState(DEFAULT_SESSION)
  const [adminKey, setAdminKey] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(ADMIN_KEY_STORAGE_KEY) ?? ''
  })
  const [players, setPlayers] = useState<Player[]>([])
  const [questions, setQuestions] = useState<Question[]>([emptyQ('q1')])
  const [bonus, setBonus] = useState<Question>(emptyQ('bonus'))
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const s = await createOrGetSession(sessionId)
      setPlayers(s.players)
    })()
  }, [sessionId])

  useEventFeed(sessionId, (evt: ServerEvent) => {
    if (evt.type === 'session_reset') {
      setPlayers([])
      return
    }
    if (evt.type === 'players_update') setPlayers(evt.players)
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (adminKey) {
      localStorage.setItem(ADMIN_KEY_STORAGE_KEY, adminKey)
    } else {
      localStorage.removeItem(ADMIN_KEY_STORAGE_KEY)
    }
  }, [adminKey])

  const upsertStatus = (text: string, tone: StatusMessage['tone']) => setStatus({ text, tone })

  const saveQuestions = async () => {
    const allFilled =
      questions.every(q => q.text.trim() && q.options.every(o => o.trim())) &&
      bonus.text.trim() &&
      bonus.options.every(o => o.trim())

    if (!allFilled) {
      upsertStatus('Please fill in every question, option, and bonus prompt.', 'info')
      return
    }

    try {
      await upsertQuestions(sessionId, questions, bonus, adminKey)
      upsertStatus('Questions saved successfully.', 'success')
    } catch {
      upsertStatus('Failed to save questions — check your admin key.', 'error')
    }
  }

  const canStart =
    players.length >= 3 &&
    questions.length > 0 &&
    questions.every(q => q.text && q.options.every(Boolean)) &&
    bonus.text &&
    bonus.options.every(Boolean)

  const onStart = async () => {
    try {
      await startGame(sessionId, adminKey)
      upsertStatus('Game launched — good luck to your players!', 'success')
    } catch {
      upsertStatus('Start failed — confirm your admin key and prerequisites.', 'error')
    }
  }

  const onReset = async () => {
    try {
      await resetSession(sessionId, adminKey)
      setPlayers([])
      upsertStatus('Session reset — players can join again.', 'success')
    } catch {
      upsertStatus('Reset failed — check the admin key.', 'error')
    }
  }

  const addQuestion = () =>
    setQuestions(prev => [...prev, emptyQ(`q${prev.length + 1}`)])

  const updateQuestion = (id: string, payload: Partial<Question>) => {
    setQuestions(prev => prev.map(q => (q.id === id ? { ...q, ...payload } : q)))
  }

  const updateOption = (id: string, index: number, value: string) => {
    setQuestions(prev =>
      prev.map(q =>
        q.id === id
          ? { ...q, options: q.options.map((opt, idx) => (idx === index ? value : opt)) }
          : q,
      ),
    )
  }

  const handleImageUpload = async (questionId: string, file: File, isBonus = false) => {
    const trimmedKey = adminKey.trim()
    if (!trimmedKey) {
      upsertStatus('Enter your admin key before uploading images.', 'info')
      return
    }

    if (!file.type.startsWith('image/')) {
      upsertStatus('Please choose an image file (PNG, JPG, GIF, etc.).', 'info')
      return
    }

    setUploadingImageId(questionId)
    try {
      const { url } = await uploadQuestionImage(sessionId, questionId, file, trimmedKey)
      if (isBonus) {
        setBonus(prev => ({ ...prev, image_url: url }))
      } else {
        setQuestions(prev => prev.map(q => (q.id === questionId ? { ...q, image_url: url } : q)))
      }
      upsertStatus('Image uploaded successfully.', 'success')
    } catch (err) {
      console.error(err)
      upsertStatus('Image upload failed — double-check your admin key and try again.', 'error')
    } finally {
      setUploadingImageId(null)
    }
  }

  const onQuestionImageChange = (id: string, event: ChangeEvent<HTMLInputElement>, isBonus = false) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void handleImageUpload(id, file, isBonus)
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={{ xs: 3, md: 4 }}>
        <Paper
          elevation={10}
          className="glass-card"
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 4,
            backgroundImage:
              'linear-gradient(140deg, rgba(148, 226, 213, 0.14), transparent 60%), linear-gradient(20deg, rgba(137, 180, 250, 0.1), transparent 55%)',
          }}
        >
          <Stack spacing={{ xs: 3, md: 4 }}>
            <Box display="flex" flexWrap="wrap" alignItems="flex-start" justifyContent="space-between" gap={1.5}>
              <Box>
                <Typography variant="h4" fontWeight={700} gutterBottom sx={{ mb: 0 }}>
                  BetterKahoots Control Room
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Configure questions, manage players, and launch the show.
                </Typography>
              </Box>
              <Chip
                label={`${players.length} / 30 players`}
                color={players.length >= 3 ? 'secondary' : 'default'}
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            </Box>

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Session ID"
                  value={sessionId}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSessionId(event.target.value)}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Admin Key"
                  type="password"
                  value={adminKey}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setAdminKey(event.target.value)}
                  fullWidth
                />
              </Grid>
            </Grid>

            {players.length > 0 ? (
              <Paper
                variant="outlined"
                sx={{
                  p: { xs: 2, md: 2.5 },
                  borderRadius: 3,
                  backgroundColor: alpha(theme.palette.background.paper, 0.65),
                }}
              >
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Lobby
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {players.map(p => (
                    <Chip key={p.id} label={p.username} sx={{ mb: 1 }} />
                  ))}
                </Stack>
              </Paper>
            ) : (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Waiting for players — share the session code to get started.
              </Alert>
            )}

            <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.25)' }} />

            <Stack spacing={2} direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h5" fontWeight={700}>
                Questions
              </Typography>
              <Button variant="outlined" onClick={addQuestion}>
                Add Question
              </Button>
            </Stack>

            <Stack spacing={{ xs: 2.5, md: 3 }}>
              {questions.map((q, idx) => (
                <Paper
                  key={q.id}
                  variant="outlined"
                  sx={{
                    p: { xs: 2, md: 3 },
                    borderRadius: 3,
                    backgroundColor: alpha(theme.palette.background.paper, 0.6),
                    borderColor: alpha(theme.palette.primary.main, 0.25),
                  }}
                >
                  <Stack spacing={2.5}>
                    <Typography variant="subtitle1" fontWeight={700}>
                      Question {idx + 1}
                    </Typography>
                    <TextField
                      label="Prompt"
                      value={q.text}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => updateQuestion(q.id, { text: event.target.value })}
                      fullWidth
                    />
                    <Box
                      sx={{
                        position: 'relative',
                        borderRadius: 3,
                        border: `1px dashed ${alpha(theme.palette.primary.main, 0.4)}`,
                        backgroundColor: alpha(theme.palette.primary.main, 0.08),
                        aspectRatio: '1',
                        width: '100%',
                        maxWidth: 420,
                        mx: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {q.image_url ? (
                        <Box
                          component="img"
                          src={q.image_url}
                          alt={`Question ${idx + 1} visual`}
                          sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', px: 2 }}>
                          No image added yet — upload an optional visual to spice up this question.
                        </Typography>
                      )}
                    </Box>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                      <Button
                        variant="outlined"
                        component="label"
                        startIcon={uploadingImageId === q.id ? <CircularProgress size={18} color="inherit" /> : undefined}
                        disabled={uploadingImageId === q.id}
                        sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                      >
                        {uploadingImageId === q.id ? 'Uploading…' : q.image_url ? 'Replace Image' : 'Add Image'}
                        <input
                          hidden
                          type="file"
                          accept="image/*"
                          onChange={event => onQuestionImageChange(q.id, event)}
                        />
                      </Button>
                      {q.image_url && (
                        <Button
                          variant="text"
                          color="secondary"
                          onClick={() => updateQuestion(q.id, { image_url: null })}
                          sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                        >
                          Remove Image
                        </Button>
                      )}
                    </Stack>
                    <Grid container spacing={2}>
                      {q.options.map((opt, i) => (
                        <Grid item xs={12} md={6} key={i}>
                          <TextField
                            label={`Option ${i + 1}`}
                            value={opt}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => updateOption(q.id, i, event.target.value)}
                            fullWidth
                          />
                        </Grid>
                      ))}
                    </Grid>
                    <TextField
                      label="Correct Option (0-3)"
                      type="number"
                      inputProps={{ min: 0, max: 3 }}
                      value={q.correct_index}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateQuestion(q.id, {
                          correct_index: Number.parseInt(event.target.value || '0', 10),
                        })
                      }
                      fullWidth
                    />
                  </Stack>
                </Paper>
              ))}
            </Stack>

            <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.25)' }} />

            <Stack spacing={2.5}>
              <Typography variant="h5" fontWeight={700}>
                Bonus Tiebreaker
              </Typography>
              <Paper
                variant="outlined"
                sx={{
                  p: { xs: 2, md: 3 },
                  borderRadius: 3,
                  backgroundColor: alpha(theme.palette.background.paper, 0.6),
                  borderColor: alpha(theme.palette.secondary.main, 0.3),
                }}
              >
                <Stack spacing={2.5}>
                  <TextField
                    label="Bonus Question"
                    value={bonus.text}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setBonus(prev => ({ ...prev, text: event.target.value }))
                    }
                    fullWidth
                  />
                  <Box
                    sx={{
                      position: 'relative',
                      borderRadius: 3,
                      border: `1px dashed ${alpha(theme.palette.secondary.main, 0.4)}`,
                      backgroundColor: alpha(theme.palette.secondary.main, 0.08),
                      aspectRatio: '1',
                      width: '100%',
                      maxWidth: 420,
                      mx: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {bonus.image_url ? (
                      <Box
                        component="img"
                        src={bonus.image_url}
                        alt="Bonus question visual"
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', px: 2 }}>
                        Add an optional image for the tiebreaker to keep players on their toes.
                      </Typography>
                    )}
                  </Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                    <Button
                      variant="outlined"
                      component="label"
                      startIcon={uploadingImageId === bonus.id ? <CircularProgress size={18} color="inherit" /> : undefined}
                      disabled={uploadingImageId === bonus.id}
                      sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                    >
                      {uploadingImageId === bonus.id ? 'Uploading…' : bonus.image_url ? 'Replace Image' : 'Add Image'}
                      <input
                        hidden
                        type="file"
                        accept="image/*"
                        onChange={event => onQuestionImageChange(bonus.id, event, true)}
                      />
                    </Button>
                    {bonus.image_url && (
                      <Button
                        variant="text"
                        color="secondary"
                        onClick={() => setBonus(prev => ({ ...prev, image_url: null }))}
                        sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                      >
                        Remove Image
                      </Button>
                    )}
                  </Stack>
                  <Grid container spacing={2}>
                    {bonus.options.map((opt, i) => (
                      <Grid item xs={12} md={6} key={i}>
                        <TextField
                          label={`Option ${i + 1}`}
                          value={opt}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            setBonus(prev => ({
                              ...prev,
                              options: prev.options.map((o, idx) => (idx === i ? event.target.value : o)),
                            }))
                          }
                          fullWidth
                        />
                      </Grid>
                    ))}
                  </Grid>
                  <TextField
                    label="Correct Option (0-3)"
                    type="number"
                    inputProps={{ min: 0, max: 3 }}
                    value={bonus.correct_index}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setBonus(prev => ({
                        ...prev,
                        correct_index: Number.parseInt(event.target.value || '0', 10),
                      }))
                    }
                    fullWidth
                  />
                </Stack>
              </Paper>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end" alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Button variant="outlined" onClick={saveQuestions}>
                Save Questions
              </Button>
              <Button variant="outlined" color="secondary" onClick={onReset}>
                Reset Session
              </Button>
              <Button variant="contained" color="primary" onClick={onStart} disabled={!canStart}>
                Start Game
              </Button>
            </Stack>

            {status && (
              <Alert severity={status.tone} sx={{ borderRadius: 3 }}>
                {status.text}
              </Alert>
            )}

            <Typography variant="caption" color="text.secondary">
              Start unlocks when at least three players have joined and every question — including the bonus — is complete.
            </Typography>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
