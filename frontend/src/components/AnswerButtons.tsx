import { Button, Grid, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'


export default function AnswerButtons({
  options,
  locked,
  revealIndex,
  selectedIndex,
  onPick,
}: {
  options: string[]
  locked: boolean
  revealIndex: number | null
  selectedIndex: number | null
  onPick: (i: number) => void
}) {
  const theme = useTheme()

  return (
    <Grid container spacing={2} columns={{ xs: 1, sm: 2 }}>
      {options.map((opt, i) => {
        const isCorrect = revealIndex !== null && i === revealIndex
        const isRevealed = revealIndex !== null
        const isSelected = selectedIndex === i
        const baseBorder = alpha(theme.palette.common.white, 0.08)
        const hoverBorder = alpha(theme.palette.common.white, 0.75)
        const correctColor = theme.palette.success.main
        const incorrectColor = alpha(theme.palette.error.main, 0.7)
        const selectedGlow = alpha(theme.palette.common.white, 0.12)

        return (
          <Grid item xs={1} sm={1} key={i}>
            <Button
              fullWidth
              size="large"
              disabled={locked}
              onClick={() => onPick(i)}
              sx={{
                justifyContent: 'flex-start',
                py: { xs: 2, md: 2.5 },
                px: { xs: 2, md: 2.5 },
                minHeight: 72,
                borderWidth: 2,
                borderStyle: 'solid',
                borderColor: isCorrect
                  ? correctColor
                  : isRevealed
                    ? incorrectColor
                    : isSelected
                      ? hoverBorder
                      : baseBorder,
                backgroundColor: isCorrect
                  ? alpha(correctColor, 0.16)
                  : isRevealed
                    ? alpha(theme.palette.error.main, 0.08)
                    : alpha(theme.palette.background.paper, 0.9),
                boxShadow: isSelected
                  ? `0 0 0 4px ${selectedGlow}`
                  : isCorrect
                    ? `0 0 0 4px ${alpha(correctColor, 0.22)}`
                    : 'none',
                color: theme.palette.text.primary,
                transition: 'transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                '&:hover': {
                  borderColor: locked ? baseBorder : hoverBorder,
                  transform: locked ? 'none' : 'translateY(-2px)',
                  boxShadow: locked
                    ? 'none'
                    : `0 0 0 4px ${alpha(theme.palette.common.white, 0.12)}`,
                },
                '&.Mui-disabled': {
                  opacity: isRevealed && !isCorrect ? 0.7 : 0.55,
                  color: theme.palette.text.secondary,
                  transform: 'none',
                  boxShadow: isCorrect
                    ? `0 0 0 4px ${alpha(correctColor, 0.22)}`
                    : 'none',
                },
              }}
            >
              <Typography variant="subtitle1" fontWeight={600} sx={{ textAlign: 'left' }}>
                {opt}
              </Typography>
            </Button>
          </Grid>
        )
      })}
    </Grid>
  )
}
