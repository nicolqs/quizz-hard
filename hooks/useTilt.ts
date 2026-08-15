'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Heads Up tilt control.
 *
 * The phone sits flat against a forehead, screen facing the room. Tilting the
 * top of the phone DOWN means "got it", tilting it UP means "pass", and the
 * control only re-arms once the phone comes back to roughly level, so one long
 * motion cannot fire twice.
 *
 * Platform reality this has to survive:
 *   - iOS 13+ requires DeviceOrientationEvent.requestPermission() from a real
 *     user gesture, and only on a secure (https) origin. On http it is absent.
 *   - Android Chrome fires the event on a secure origin with no prompt.
 *   - Desktop has no sensor at all.
 * Anything other than 'ready' means the caller should show tap controls.
 */
export type TiltStatus =
  | 'unsupported' // no sensor, or insecure origin: use taps
  | 'needs-permission' // iOS, waiting for the user to tap "enable tilt"
  | 'denied'
  | 'ready'

const TRIGGER_DEGREES = 30
const REARM_DEGREES = 15

type PermissionCapableDeviceOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

function needsPermission(): boolean {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return false
  return typeof (DeviceOrientationEvent as PermissionCapableDeviceOrientation).requestPermission === 'function'
}

export function useTilt({
  enabled,
  onGot,
  onPass,
}: {
  enabled: boolean
  onGot: () => void
  onPass: () => void
}) {
  const [status, setStatus] = useState<TiltStatus>('unsupported')
  // Desktop Chrome exposes the API on localhost with no sensor behind it, so
  // "permission granted" is not proof of tilt. Only a real reading counts.
  const [live, setLive] = useState(false)
  // Held in a ref so the orientation listener never needs re-binding mid-round.
  const armed = useRef(true)
  const handlers = useRef({ onGot, onPass })
  handlers.current = { onGot, onPass }

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof DeviceOrientationEvent === 'undefined' || !window.isSecureContext) {
      setStatus('unsupported')
      return
    }
    setStatus(needsPermission() ? 'needs-permission' : 'ready')
  }, [])

  const request = useCallback(async () => {
    const api = DeviceOrientationEvent as PermissionCapableDeviceOrientation
    if (typeof api?.requestPermission !== 'function') {
      setStatus('ready')
      return
    }
    try {
      const result = await api.requestPermission()
      setStatus(result === 'granted' ? 'ready' : 'denied')
    } catch {
      setStatus('denied')
    }
  }, [])

  useEffect(() => {
    if (!enabled || status !== 'ready') return

    const onOrientation = (event: DeviceOrientationEvent) => {
      // Which axis points "down the forehead" depends on how the phone is held.
      // In landscape that is gamma, in portrait it is beta.
      if (event.beta === null && event.gamma === null) return
      setLive(true)

      const angle =
        typeof window.screen?.orientation?.angle === 'number' ? window.screen.orientation.angle : 0
      const landscape = angle === 90 || angle === 270 || angle === -90

      let tilt: number
      if (landscape) {
        // gamma flips sign between the two landscape orientations.
        tilt = (event.gamma ?? 0) * (angle === 270 || angle === -90 ? -1 : 1)
      } else {
        // beta is ~90 when upright; measure the deviation from vertical.
        tilt = (event.beta ?? 90) - 90
      }

      if (!armed.current) {
        if (Math.abs(tilt) < REARM_DEGREES) armed.current = true
        return
      }

      if (tilt <= -TRIGGER_DEGREES) {
        armed.current = false
        handlers.current.onGot()
      } else if (tilt >= TRIGGER_DEGREES) {
        armed.current = false
        handlers.current.onPass()
      }
    }

    window.addEventListener('deviceorientation', onOrientation)
    return () => window.removeEventListener('deviceorientation', onOrientation)
  }, [enabled, status])

  /** Call between cards so a held position cannot immediately re-fire. */
  const disarm = useCallback(() => {
    armed.current = false
  }, [])

  // Anything but 'ready' means the caller shows tap controls instead.
  return { status: status === 'ready' && !live ? ('unsupported' as TiltStatus) : status, request, disarm }
}
