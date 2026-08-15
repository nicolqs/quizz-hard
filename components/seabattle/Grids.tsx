'use client'

import { BOARD_SIZE, cellsOf, key, type Board, type Shot } from '@/lib/seabattle'

const COLUMNS = 'ABCDEFGH'.slice(0, BOARD_SIZE).split('')

// w-full matters: a <button> sizes to its content even when display is flex, so
// an empty cell would otherwise be zero wide, invisible and unclickable.
const cellBase =
  'w-full aspect-square rounded-[3px] text-[10px] font-bold flex items-center justify-center transition-colors'

/** Your own waters: your fleet, and everything they have thrown at it. */
export function OwnGrid({ board, incoming }: { board: Board | null; incoming: Shot[] }) {
  const ships = new Set(
    (board?.placements ?? []).flatMap((p) => cellsOf(p).map((c) => key(c.x, c.y))),
  )
  const shots = new Map(incoming.map((s) => [key(s.x, s.y), s]))

  return (
    <Grid
      label="Your waters"
      render={(x, y) => {
        const shot = shots.get(key(x, y))
        const hasShip = ships.has(key(x, y))
        if (shot?.result === 'sunk' || (shot && hasShip)) {
          return <span className={`${cellBase} bg-danger text-white`}>✕</span>
        }
        if (shot) return <span className={`${cellBase} bg-white/10 text-white/40`}>•</span>
        if (hasShip) return <span className={`${cellBase} bg-secondary/70`} />
        return <span className={`${cellBase} bg-white/5`} />
      }}
    />
  )
}

/** Their waters: only what your own shots have revealed. */
export function TargetGrid({
  shots,
  canFire,
  onFire,
}: {
  shots: Shot[]
  canFire: boolean
  onFire: (x: number, y: number) => void
}) {
  const fired = new Map(shots.map((s) => [key(s.x, s.y), s]))

  return (
    <Grid
      label={canFire ? 'Take your shot' : 'Their waters'}
      render={(x, y) => {
        const shot = fired.get(key(x, y))
        if (shot?.result === 'sunk') {
          return <span className={`${cellBase} bg-danger text-white`}>☠</span>
        }
        if (shot?.result === 'hit') {
          return <span className={`${cellBase} bg-danger/80 text-white`}>✕</span>
        }
        if (shot) return <span className={`${cellBase} bg-white/10 text-white/40`}>•</span>
        return (
          <button
            aria-label={`Fire ${COLUMNS[x]}${y + 1}`}
            disabled={!canFire}
            onClick={() => onFire(x, y)}
            className={`${cellBase} ${
              canFire ? 'bg-primary/25 hover:bg-primary/50 active:bg-primary' : 'bg-white/5'
            }`}
          />
        )
      }}
    />
  )
}

function Grid({ label, render }: { label: string; render: (x: number, y: number) => React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-[0.2em] text-white/50">{label}</p>
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
          const x = index % BOARD_SIZE
          const y = Math.floor(index / BOARD_SIZE)
          return <div key={index}>{render(x, y)}</div>
        })}
      </div>
    </div>
  )
}
