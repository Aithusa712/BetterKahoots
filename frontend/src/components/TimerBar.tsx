import { Box } from '@mui/material'
import { useEffect, useRef } from 'react'


export default function TimerBar({ deadlineTs }: { deadlineTs: number }) {
  const fillRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fill = fillRef.current
    if (!fill) return

    const msLeft = Math.max(0, Math.floor((deadlineTs * 1000) - Date.now()))

    fill.style.transitionDuration = '0ms'
    fill.style.width = '100%'
    void fill.offsetWidth

    fill.style.transitionDuration = `${msLeft}ms`
    requestAnimationFrame(() => { fill.style.width = '0%' })
  }, [deadlineTs])

  return (
    <Box
      sx={{
        height: 10,
        width: '100%',
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: 'rgba(148, 163, 184, 0.25)',
        mb: { xs: 2, md: 3 },
      }}
    >
      <Box
        ref={fillRef}
        sx={{
          height: '100%',
          width: '100%',
          bgcolor: 'success.main',
          transitionProperty: 'width',
          transitionTimingFunction: 'linear',
        }}
      />
    </Box>
  )
}
