import { useEffect, useRef } from 'react'

import type { ServerEvent } from '../types'


type LoggedEvent = { seq: number; timestamp?: number; payload: ServerEvent }

const DEFAULT_INTERVAL = 1000

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function useEventFeed(
  sessionId: string,
  onEvent: (evt: ServerEvent) => void,
  pollIntervalMs: number = DEFAULT_INTERVAL,
) {
  const lastSeqRef = useRef<number | null>(null)
  const handlerRef = useRef(onEvent)

  useEffect(() => {
    handlerRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    lastSeqRef.current = null
    if (!sessionId) return

    let cancelled = false

    async function pump() {
      while (!cancelled) {
        try {
          const params =
            lastSeqRef.current != null ? `?after=${lastSeqRef.current}` : ''
          const res = await fetch(
            `/api/session/${encodeURIComponent(sessionId)}/events${params}`,
          )
          if (res.ok) {
            const data = await res.json()
            const events: LoggedEvent[] = data.events ?? []
            for (const evt of events) {
              lastSeqRef.current = evt.seq
              if (evt.payload) {
                handlerRef.current(evt.payload)
              }
            }
          }
        } catch (err) {
          console.error('Event polling failed', err)
        }

        await sleep(pollIntervalMs)
      }
    }

    pump()

    return () => {
      cancelled = true
    }
  }, [sessionId, pollIntervalMs])
}

