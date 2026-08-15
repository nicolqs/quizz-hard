'use client'

import { useEffect, useRef, useState } from 'react'
import type { TiltStatus } from '@/hooks/useTilt'

type Props = {
  word: string
  /** Seconds left in the round, already derived from the shared start time. */
  timeLeft: number
  roundSeconds: number
  /** Counts 3, 2, 1 before the timer starts. 0 means the round is live. */
  countdown: number
  cardsLeft: number
  score: number
  tiltStatus: TiltStatus
  onEnableTilt: () => void
  onGot: () => void
  onPass: () => void
}

/**
 * The forehead screen. Everything is sized for someone reading it from across a
 * room, and the only two interactions are "got it" and "pass".
 */
export function HeadsUpCard({
  word,
  timeLeft,
  roundSeconds,
  countdown,
  cardsLeft,
  score,
  tiltStatus,
  onEnableTilt,
  onGot,
  onPass,
}: Props) {
  const [flash, setFlash] = useState<'got' | 'pass' | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
  }, [])

  const decide = (kind: 'got' | 'pass') => {
    setFlash(kind)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 420)
    if (kind === 'got') onGot()
    else onPass()
  }

  // Tell the guesser how to play only when the sensor is not doing it for them.
  const useTaps = tiltStatus !== 'ready'
  const urgent = timeLeft <= 10 && countdown === 0

  if (countdown > 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-center">
        <p className="text-lg uppercase tracking-[0.3em] text-white/60">Phone on your forehead</p>
        <p className="mt-6 text-[9rem] font-black leading-none text-primary">{countdown}</p>
        {tiltStatus === 'needs-permission' ? (
          <button
            onClick={onEnableTilt}
            className="mt-8 rounded-xl bg-primary px-6 py-3 text-lg font-semibold text-slate-950"
          >
            Enable tilt
          </button>
        ) : (
          <p className="mt-8 text-white/60">
            {useTaps ? 'Tap the bottom half for correct, the top half to pass' : 'Tilt down for correct, up to pass'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col transition-colors duration-200 ${
        flash === 'got' ? 'bg-emerald-500' : flash === 'pass' ? 'bg-amber-500' : 'bg-slate-950'
      }`}
    >
      {/* Top half: pass */}
      <button
        onClick={() => decide('pass')}
        className="flex flex-1 items-start justify-center pt-6 text-center"
        aria-label="Pass"
      >
        {useTaps ? (
          <span className="rounded-full border border-white/20 px-4 py-1 text-sm uppercase tracking-widest text-white/60">
            Tap here to pass
          </span>
        ) : (
          <span className="text-sm uppercase tracking-widest text-white/40">Tilt up to pass</span>
        )}
      </button>

      <div className="pointer-events-none px-4 text-center">
        <p className="text-[clamp(2.5rem,13vw,7rem)] font-black leading-[1.05] tracking-tight text-white break-words">
          {word}
        </p>
      </div>

      {/* Bottom half: correct */}
      <button
        onClick={() => decide('got')}
        className="flex flex-1 flex-col items-center justify-end pb-6 text-center"
        aria-label="Correct"
      >
        {useTaps ? (
          <span className="rounded-full border border-emerald-300/40 bg-emerald-500/10 px-4 py-1 text-sm uppercase tracking-widest text-emerald-200">
            Tap here for correct
          </span>
        ) : (
          <span className="text-sm uppercase tracking-widest text-white/40">Tilt down for correct</span>
        )}
      </button>

      {/* Status strip: never competes with the word */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-2 text-sm">
        <span className="tabular-nums text-white/50">{score} correct</span>
        <span
          className={`rounded-full px-3 py-0.5 font-semibold tabular-nums ${
            urgent ? 'bg-red-500 text-white' : 'text-white/70'
          }`}
        >
          {Math.max(0, timeLeft)}s
        </span>
        <span className="tabular-nums text-white/50">{cardsLeft} left</span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-white/10">
        <div
          className="h-full bg-primary transition-[width] duration-500 ease-linear"
          style={{ width: `${Math.max(0, Math.min(100, (timeLeft / roundSeconds) * 100))}%` }}
        />
      </div>
    </div>
  )
}
