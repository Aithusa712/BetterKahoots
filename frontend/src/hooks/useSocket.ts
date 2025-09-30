import { useEffect, useRef } from 'react'
import type { ServerEvent } from '../types'


export function useSocket(sessionId: string, onMessage: (evt: ServerEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null)


  useEffect(() => {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + `/ws/${sessionId}`
    const ws = new WebSocket(url)
    wsRef.current = ws
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)) } catch { }
    }
    ws.onopen = () => ws.send('hi')
    return () => { ws.close() }
  }, [sessionId])


  return wsRef
}
