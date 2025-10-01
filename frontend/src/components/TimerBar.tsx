import { useEffect, useRef } from 'react'


export default function TimerBar({ deadlineTs }: { deadlineTs: number }) {
  const fillRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fill = fillRef.current
    if (!fill) return

    const msLeft = Math.max(0, Math.floor((deadlineTs * 1000) - Date.now()))

    // Reset the bar to full width before starting a new countdown so
    // subsequent questions animate correctly.
    fill.style.transitionDuration = '0ms'
    fill.style.width = '100%'
    // Force a reflow so the width reset is applied immediately.
    void fill.offsetWidth

    fill.style.transitionDuration = `${msLeft}ms`
    requestAnimationFrame(() => { fill.style.width = '0%' })
  }, [deadlineTs])
  return (
    <div className="timerbar"><div ref={fillRef} className="fill" /></div>
  )
}
