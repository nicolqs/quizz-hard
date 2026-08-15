'use client'

import { useEffect, useState } from 'react'
import type { Instruction, SpaceteamState } from '@/lib/spaceteam'
import { MAX_HULL } from '@/lib/spaceteam'

/** The instruction on your screen. Shout it, because it is rarely yours to do. */
export function InstructionCard({ instruction }: { instruction: Instruction | null }) {
  const [remaining, setRemaining] = useState(1)

  useEffect(() => {
    if (!instruction) return
    const tick = () => {
      const total = instruction.expiresAt - instruction.issuedAt
      setRemaining(Math.max(0, Math.min(1, (instruction.expiresAt - Date.now()) / total)))
    }
    tick()
    const timer = setInterval(tick, 100)
    return () => clearInterval(timer)
  }, [instruction])

  if (!instruction) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-white/50">
        Standing by…
      </div>
    )
  }

  const urgent = remaining < 0.35

  return (
    <div
      className={`rounded-2xl border p-5 text-center transition-colors ${
        urgent ? 'border-danger/60 bg-danger/10' : 'border-primary/40 bg-primary/10'
      }`}
    >
      <p className="text-xs uppercase tracking-[0.3em] text-white/50">Shout this</p>
      <p className="mt-2 text-2xl font-black leading-tight sm:text-3xl">{instruction.text}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full transition-[width] duration-100 ease-linear ${urgent ? 'bg-danger' : 'bg-primary'}`}
          style={{ width: `${remaining * 100}%` }}
        />
      </div>
    </div>
  )
}

/** Hull, level and the last few things that went right or wrong. */
export function ShipStatus({ state, compact }: { state: SpaceteamState; compact?: boolean }) {
  const hullPercent = Math.max(0, (state.hull / MAX_HULL) * 100)
  const critical = hullPercent <= 30

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">Level {state.level}</span>
        <span className="text-white/60">{state.completed} cleared</span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs uppercase tracking-widest text-white/50">Hull</span>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full transition-all duration-300 ${critical ? 'bg-danger' : 'bg-secondary'}`}
            style={{ width: `${hullPercent}%` }}
          />
        </div>
        <span className={`text-xs tabular-nums ${critical ? 'text-danger' : 'text-white/60'}`}>
          {Math.round(hullPercent)}%
        </span>
      </div>

      {!compact && state.log.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs">
          {state.log.map((entry, i) => (
            <li key={`${entry.at}-${i}`} className={entry.good ? 'text-secondary/80' : 'text-danger/80'}>
              {entry.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
