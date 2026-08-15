'use client'

import { useEffect } from 'react'

type WakeLockSentinel = { release: () => Promise<void> }
type WakeLockCapableNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> }
}

/**
 * Keeps the screen awake while a turn is live. A phone that sleeps on your
 * forehead ends the round for everyone, and the auto-lock is usually 30s.
 * Unsupported browsers simply do nothing.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return
    const api = (navigator as WakeLockCapableNavigator).wakeLock
    if (!api) return

    let sentinel: WakeLockSentinel | null = null
    let released = false

    const acquire = async () => {
      try {
        sentinel = await api.request('screen')
      } catch {
        // Denied or not allowed in this context: nothing to do.
      }
    }

    // The lock is dropped whenever the tab is hidden, so take it again on return.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !released) void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release().catch(() => {})
    }
  }, [active])
}
