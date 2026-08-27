'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BOARD_SIZE,
  FLEET,
  canPlace,
  cellsOf,
  isComplete,
  key,
  randomBoard,
  shipById,
  shotsAgainst,
  shotsBy,
  type Board,
  type Placement,
  type SeaBattleState,
  type ShipId,
} from '@/lib/seabattle'
import { OwnGrid, TargetGrid } from './Grids'

/**
 * The whole game from one player's seat.
 *
 * Nothing here ever learns where the opponent's ships are: the fleet fetch only
 * returns your own, and every shot is resolved on the server.
 */
export function SeaBattle({
  code,
  playerId,
  state,
  names,
  onState,
}: {
  code: string
  playerId: string
  state: SeaBattleState
  names: Record<string, string>
  onState: (state: SeaBattleState) => void
}) {
  const [board, setBoard] = useState<Board>({ placements: [] })
  const [selected, setSelected] = useState<ShipId>(FLEET[0].id)
  const [horizontal, setHorizontal] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loaded = useRef(false)

  const isPlayer = state.playerIds.includes(playerId)
  const opponentId = state.playerIds.find((id) => id !== playerId) ?? ''
  const placed = state.ready[playerId] === true

  // Your own fleet comes from the server, never from the room payload.
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    fetch(`/api/rooms/${code}/sea-battle?playerId=${playerId}`)
      .then((r) => r.json())
      .then((data) => {
        const mine = data?.boards?.[playerId]
        if (mine?.placements?.length) setBoard(mine)
      })
      .catch(() => {})
  }, [code, playerId])

  const place = (x: number, y: number) => {
    const placement: Placement = { shipId: selected, x, y, horizontal }
    const without = board.placements.filter((p) => p.shipId !== selected)
    if (!canPlace({ placements: without }, placement)) {
      setError('That ship will not fit there. Ships cannot touch, not even corners.')
      return
    }
    setError(null)
    setBoard({ placements: [...without, placement] })
    const next = FLEET.find((s) => !without.some((p) => p.shipId === s.id) && s.id !== selected)
    if (next) setSelected(next.id)
  }

  const submit = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/rooms/${code}/sea-battle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'board', playerId, board }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Could not save your fleet')
      if (data.state) onState(data.state)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }, [board, code, playerId, onState])

  const fire = async (x: number, y: number) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/rooms/${code}/sea-battle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'fire', playerId, x, y }),
      })
      const data = await res.json()
      if (res.ok && data.state) onState(data.state)
      else if (!res.ok) setError(data?.error ?? 'That shot was not allowed')
    } finally {
      setBusy(false)
    }
  }

  // ------------------------------------------------------------------ result
  if (state.winner) {
    const won = state.winner === playerId
    const loserId = state.playerIds.find((id) => id !== state.winner)
    // Everyone not in the duel is watching it. Telling the rest of the room
    // "You are sunk" over a battle they had no fleet in was the old behaviour:
    // this branch ran before the spectating one, so it caught them too.
    const headline = !isPlayer ? '🏴 Battle over' : won ? '🎉 Fleet destroyed' : '💥 You are sunk'
    const detail = !isPlayer
      ? `${names[state.winner] ?? 'Someone'} sank ${names[loserId ?? ''] ?? 'the other fleet'}.`
      : won
        ? 'You found every ship first.'
        : `${names[state.winner] ?? 'Your opponent'} got there first.`
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-3xl font-black">{headline}</p>
        <p className="mt-2 text-white/70">{detail}</p>
        <p className="mt-1 text-sm text-white/50">
          {shotsBy(state, state.winner).length} shots fired to finish it.
        </p>
      </div>
    )
  }

  // ------------------------------------------------------------ spectating
  if (!isPlayer) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white/70">
        <p className="text-lg font-semibold">
          {names[state.playerIds[0]]} vs {names[state.playerIds[1]]}
        </p>
        <p className="mt-2 text-sm">
          Sea Battle is a duel, so you are watching this one. {state.shots.length}{' '}
          {state.shots.length === 1 ? 'shot' : 'shots'} so far.
        </p>
      </div>
    )
  }

  // ------------------------------------------------------------- placement
  if (!placed) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold">Place your fleet</p>
          <p className="mt-1 text-xs text-white/60">
            Pick a ship, choose across or down, then tap where its nose goes. Ships may not touch.
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {FLEET.map((ship) => {
              const done = board.placements.some((p) => p.shipId === ship.id)
              return (
                <button
                  key={ship.id}
                  onClick={() => setSelected(ship.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    selected === ship.id
                      ? 'border-primary bg-primary/20 text-primary'
                      : done
                        ? 'border-secondary/40 bg-secondary/10 text-secondary'
                        : 'border-white/10 bg-white/5 text-white/70'
                  }`}
                >
                  {ship.name} · {ship.length}
                  {done ? ' ✓' : ''}
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => setHorizontal((h) => !h)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold"
            >
              {horizontal ? '↔ Across' : '↕ Down'}
            </button>
            <button
              onClick={() => setBoard(randomBoard())}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold"
            >
              Scatter
            </button>
            <button
              onClick={() => setBoard({ placements: [] })}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold"
            >
              Clear
            </button>
          </div>
        </div>

        <PlacementGrid board={board} onPlace={place} />

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          disabled={!isComplete(board) || busy}
          onClick={submit}
          className={`w-full rounded-xl px-4 py-3 text-lg font-semibold transition ${
            isComplete(board) ? 'bg-primary text-slate-950' : 'cursor-not-allowed bg-white/10 text-white/40'
          }`}
        >
          {busy ? 'Saving…' : isComplete(board) ? 'Ready' : `${FLEET.length - board.placements.length} ships left`}
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------- battle
  const waiting = !state.turn
  const myTurn = state.turn === playerId

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border p-4 text-center ${
          myTurn ? 'border-primary/50 bg-primary/10' : 'border-white/10 bg-white/5'
        }`}
      >
        <p className="text-lg font-bold">
          {waiting
            ? `Waiting for ${names[opponentId] ?? 'your opponent'} to place their fleet…`
            : myTurn
              ? 'Your shot'
              : `${names[opponentId] ?? 'Your opponent'} is aiming…`}
        </p>
        {state.shots.length > 0 && (
          <p className="mt-1 text-xs text-white/60">{lastShotSummary(state, names)}</p>
        )}
      </div>

      <TargetGrid shots={shotsBy(state, playerId)} canFire={myTurn && !busy} onFire={fire} />
      <OwnGrid board={board} incoming={shotsAgainst(state, playerId)} />

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}

function lastShotSummary(state: SeaBattleState, names: Record<string, string>) {
  const shot = state.shots[state.shots.length - 1]
  if (!shot) return ''
  const who = names[shot.by] ?? 'Someone'
  if (shot.result === 'sunk') return `${who} sank the ${shipById(shot.shipId!).name}`
  return shot.result === 'hit' ? `${who} scored a hit` : `${who} missed`
}

/** The placement board: tap a cell to drop the selected ship's nose there. */
function PlacementGrid({ board, onPlace }: { board: Board; onPlace: (x: number, y: number) => void }) {
  const ships = new Map<string, ShipId>()
  for (const placement of board.placements) {
    for (const cell of cellsOf(placement)) ships.set(key(cell.x, cell.y), placement.shipId)
  }

  return (
    <div
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
        const x = index % BOARD_SIZE
        const y = Math.floor(index / BOARD_SIZE)
        const occupiedBy = ships.get(key(x, y))
        return (
          <button
            key={index}
            aria-label={`Place ${'ABCDEFGH'[x]}${y + 1}`}
            onClick={() => onPlace(x, y)}
            className={`w-full aspect-square rounded-[3px] transition-colors ${
              occupiedBy ? 'bg-secondary/70' : 'bg-white/5 hover:bg-primary/30'
            }`}
          />
        )
      })}
    </div>
  )
}
