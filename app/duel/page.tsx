'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { PingPong } from '@/components/duel/PingPong'
import { Reaction } from '@/components/duel/Reaction'
import { Sumo } from '@/components/duel/Sumo'
import {
  duelGames,
  emptyScore,
  getDuelGame,
  matchWinner,
  playerColor,
  playerName,
  POINTS_TO_WIN,
  type DuelGameId,
  type DuelPlayer,
  type DuelScore,
} from '@/lib/duel'

// One phone between two people. No room code, no network, no account: player 1
// sits at the top with their half rotated, player 2 at the bottom.

type Phase = 'pick' | 'ready' | 'playing' | 'point' | 'over'

export default function DuelPage() {
  const [gameId, setGameId] = useState<DuelGameId | null>(null)
  const [phase, setPhase] = useState<Phase>('pick')
  const [score, setScore] = useState<DuelScore>(emptyScore())
  const [lastPoint, setLastPoint] = useState<{ winner: DuelPlayer; detail?: string } | null>(null)
  const [countdown, setCountdown] = useState(3)

  const game = gameId ? getDuelGame(gameId) : null

  const startMatch = (id: DuelGameId) => {
    setGameId(id)
    setScore(emptyScore())
    setLastPoint(null)
    setPhase('ready')
  }

  // 3, 2, 1 before each point, so nobody's thumb is caught out.
  useEffect(() => {
    if (phase !== 'ready') return
    setCountdown(3)
    const ticker = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(ticker)
          setPhase('playing')
          return 0
        }
        return c - 1
      })
    }, 700)
    return () => clearInterval(ticker)
  }, [phase])

  const handlePoint = useCallback((winner: DuelPlayer, detail?: string) => {
    setLastPoint({ winner, detail })
    setScore((prev) => {
      const next = { ...prev, [winner]: prev[winner] + 1 }
      setPhase(matchWinner(next) ? 'over' : 'point')
      return next
    })
  }, [])

  const nextPoint = () => setPhase('ready')

  const quit = () => {
    setGameId(null)
    setPhase('pick')
    setScore(emptyScore())
    setLastPoint(null)
  }

  // ---------------------------------------------------------------- picker
  if (!game) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
        <header>
          <Link href="/" className="text-xs uppercase tracking-[0.4em] text-primary/80 hover:opacity-80">
            Nix Games
          </Link>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">2 Player Games</h1>
          <p className="mt-2 text-slate-300">
            One phone, two thumbs. Put it flat on the table between you, player one at the top.
            First to {POINTS_TO_WIN} points takes the match.
          </p>
        </header>

        <div className="grid gap-3">
          {duelGames.map((option) => (
            <button
              key={option.id}
              onClick={() => startMatch(option.id)}
              className="glass rounded-2xl border border-white/10 p-5 text-left transition hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">{option.emoji}</span>
                <div>
                  <div className="text-lg font-semibold">{option.name}</div>
                  <div className="text-sm text-white/60">{option.blurb}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <Link href="/" className="text-center text-sm text-white/50 hover:text-white/80">
          ← Back to the party quiz
        </Link>
      </div>
    )
  }

  // ---------------------------------------------------------------- match
  const winner = matchWinner(score)

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950">
      {/* Player 1's score, rotated to face them across the table. */}
      <ScoreBar player={1} score={score} rotated />

      <div className="relative min-h-0 flex-1">
        {gameId === 'pong' && <PingPong onPoint={handlePoint} running={phase === 'playing'} />}
        {gameId === 'sumo' && <Sumo onPoint={handlePoint} running={phase === 'playing'} />}
        {gameId === 'reaction' && <Reaction onPoint={handlePoint} running={phase === 'playing'} />}

        {phase === 'ready' && (
          <Overlay>
            <p className="text-7xl font-black text-primary">{countdown || 'GO'}</p>
            <p className="mt-3 max-w-xs text-center text-sm text-white/70">{game.howTo}</p>
          </Overlay>
        )}

        {phase === 'point' && lastPoint && (
          <Overlay onClick={nextPoint}>
            <p className="text-3xl font-black" style={{ color: playerColor[lastPoint.winner] }}>
              {playerName[lastPoint.winner]} scores
            </p>
            {lastPoint.detail && <p className="mt-1 text-sm text-white/60">{lastPoint.detail}</p>}
            <p className="mt-6 text-4xl font-bold tabular-nums">
              {score[1]} <span className="text-white/30">-</span> {score[2]}
            </p>
            <p className="mt-6 rounded-xl bg-primary px-5 py-2 font-semibold text-slate-950">
              Tap for the next point
            </p>
          </Overlay>
        )}

        {phase === 'over' && winner && (
          <Overlay>
            <p className="text-sm uppercase tracking-[0.3em] text-white/50">{game.name}</p>
            <p className="mt-2 text-4xl font-black" style={{ color: playerColor[winner] }}>
              {playerName[winner]} wins
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {score[1]} <span className="text-white/30">-</span> {score[2]}
            </p>
            <div className="mt-8 flex flex-col gap-2">
              <button
                onClick={() => startMatch(game.id)}
                className="rounded-xl bg-primary px-6 py-3 font-semibold text-slate-950"
              >
                Rematch
              </button>
              <button
                onClick={quit}
                className="rounded-xl border border-white/15 px-6 py-3 font-semibold text-white/80"
              >
                Pick another game
              </button>
            </div>
          </Overlay>
        )}
      </div>

      <ScoreBar player={2} score={score} onQuit={quit} />
    </div>
  )
}

function Overlay({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onPointerDown={onClick}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-sm"
    >
      {children}
    </div>
  )
}

function ScoreBar({
  player,
  score,
  rotated,
  onQuit,
}: {
  player: DuelPlayer
  score: DuelScore
  rotated?: boolean
  onQuit?: () => void
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-between px-4 py-2 ${rotated ? 'rotate-180' : ''}`}
      style={{ background: `${playerColor[player]}1a` }}
    >
      <span className="text-sm font-semibold" style={{ color: playerColor[player] }}>
        {playerName[player]}
      </span>
      <span className="text-2xl font-black tabular-nums" style={{ color: playerColor[player] }}>
        {score[player]}
      </span>
      {onQuit ? (
        <button onClick={onQuit} className="text-xs text-white/40 hover:text-white/70">
          quit
        </button>
      ) : (
        <span className="text-xs text-white/30">first to {POINTS_TO_WIN}</span>
      )}
    </div>
  )
}
