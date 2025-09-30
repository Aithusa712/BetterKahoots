import { useEffect, useRef } from 'react'

import type { ServerEvent } from '../types'


type LoggedEvent = { seq: number; timestamp?: number; payload: ServerEvent }

const DEFAULT_INTERVAL = 1000

const MAX_BACKOFF_MULTIPLIER = 5

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

  const intervalRef = useRef(pollIntervalMs)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    handlerRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    lastSeqRef.current = null

    intervalRef.current = pollIntervalMs

    if (!sessionId) return

    let cancelled = false

    async function pump() {
      while (!cancelled) {
        const controller = new AbortController()
        abortRef.current = controller

        try {
          const params =
            lastSeqRef.current != null ? `?after=${lastSeqRef.current}` : ''
          const res = await fetch(
            `/api/session/${encodeURIComponent(sessionId)}/events${params}`,

            { signal: controller.signal },

          )
          if (res.ok) {
            const data = await res.json()
            const events: LoggedEvent[] = data.events ?? []

            if (events.length) {
              intervalRef.current = pollIntervalMs
            } else {
              intervalRef.current = Math.min(
                pollIntervalMs * MAX_BACKOFF_MULTIPLIER,
                intervalRef.current + pollIntervalMs,
              )
            }

            for (const evt of events) {
              lastSeqRef.current = evt.seq
              if (evt.payload) {
                handlerRef.current(evt.payload)
              }
            }

          } else {
            intervalRef.current = Math.min(
              pollIntervalMs * MAX_BACKOFF_MULTIPLIER,
              intervalRef.current + pollIntervalMs,
            )
          }
        } catch (err) {
          console.error('Event polling failed', err)
          intervalRef.current = Math.min(
            pollIntervalMs * MAX_BACKOFF_MULTIPLIER,
            intervalRef.current + pollIntervalMs,
          )
        }

        await sleep(intervalRef.current)

      }
    }

    pump()

    return () => {
      cancelled = true

      abortRef.current?.abort()

    }
  }, [sessionId, pollIntervalMs])
}

