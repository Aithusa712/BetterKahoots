import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import type { Player } from '../types'


export default function Leaderboard({
  open,
  players,
  onClose,
}: {
  open: boolean
  players: Player[]
  onClose?: () => void
}) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          borderRadius: fullScreen ? 0 : 4,
          border: `1px solid ${theme.palette.divider}`,
          backgroundImage:
            'linear-gradient(145deg, rgba(148, 226, 213, 0.08), transparent 55%), linear-gradient(320deg, rgba(203, 166, 247, 0.12), transparent 60%)',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Leaderboard
        </Typography>
        {onClose && (
          <IconButton onClick={onClose} edge="end" size="small" sx={{ color: 'text.secondary' }}>
            ×
          </IconButton>
        )}
      </DialogTitle>
      <DialogContent dividers sx={{ px: { xs: 1.5, sm: 3 }, pb: { xs: 2, sm: 3 } }}>
        <List disablePadding>
          {players.map((p, idx) => {
            const accent = idx === 0
              ? theme.palette.primary.main
              : idx === 1
                ? theme.palette.secondary.main
                : idx === 2
                  ? theme.palette.success.main
                  : theme.palette.text.secondary

            return (
              <ListItem
                key={p.id}
                sx={{
                  borderRadius: 3,
                  mb: 1,
                  px: { xs: 2, sm: 2.5 },
                  py: { xs: 1.5, sm: 1.75 },
                  bgcolor: idx < 3
                    ? `${accent}1a`
                    : 'rgba(98, 114, 164, 0.18)',
                  border: `1px solid ${idx < 3 ? accent : 'rgba(148, 163, 184, 0.25)'}`,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="baseline" gap={1}>
                      <Typography variant="h6" fontWeight={700} color={accent}>
                        #{idx + 1}
                      </Typography>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {p.username}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <Typography variant="body2" color="text.secondary">
                      {p.score.toLocaleString()} pts
                    </Typography>
                  }
                />
              </ListItem>
            )
          })}
        </List>
        {players.length === 0 && (
          <Box textAlign="center" py={2}>
            <Typography variant="body2" color="text.secondary">
              No scores yet — stay tuned!
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}
