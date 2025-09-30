import { useEffect, useRef } from 'react'


export default function TimerBar({ deadlineTs }: { deadlineTs: number }) {
  const fillRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const msLeft = Math.max(0, Math.floor((deadlineTs * 1000) - Date.now()))
    if (fillRef.current) {
      fillRef.current.style.transitionDuration = `${msLeft}ms`
      // From 100% down to 0%
      requestAnimationFrame(() => { if (fillRef.current) fillRef.current.style.width = '0%' })
    }
  }, [deadlineTs])
  return (
    <div className="timerbar"><div ref={fillRef} className="fill" /></div>
  )
}
