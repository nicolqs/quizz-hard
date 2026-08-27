'use client'

import { useEffect, useState } from 'react'

// Generation has no progress events to report, so the bar is a promise about
// the usual case rather than a measurement. It runs to CEILING over durationMs
// and then creeps, because a bar parked at 100% while nothing happens reads as
// frozen - the one thing a progress bar exists to rule out.
const CEILING = 95
const CREEP_MAX = 99
const TICK_MS = 100

interface GenerationProgressProps {
  /** How long the work usually takes. The bar reaches ~95% here. */
  durationMs?: number
  /** Set false to reset to zero and stop ticking. */
  active?: boolean
  label?: string
}

export function GenerationProgress({
  durationMs = 10000,
  active = true,
  label = 'Generating...',
}: GenerationProgressProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!active) {
      setProgress(0)
      return
    }

    setProgress(0)
    const startedAt = Date.now()

    const ticker = setInterval(() => {
      const t = (Date.now() - startedAt) / durationMs
      const pct =
        t <= 1
          ? // Ease out: quick off the line so the bar is obviously alive on the
            // first frame, settling as it approaches the expected finish.
            CEILING * (1 - Math.pow(1 - t, 3))
          : // Past the estimate. Keep inching so a slow call still looks alive.
            Math.min(CREEP_MAX, CEILING + (t - 1) * 2)
      setProgress(pct)
    }, TICK_MS)

    return () => clearInterval(ticker)
  }, [active, durationMs])

  return (
    <div className="w-full space-y-2">
      <div
        className="h-6 w-full overflow-hidden rounded-full border-2 border-primary/30 bg-white/10"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="animate-gradient h-full bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_100%] transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-lg font-bold text-primary">
        <span>{label}</span>
        <span>{Math.round(progress)}%</span>
      </div>
    </div>
  )
}
