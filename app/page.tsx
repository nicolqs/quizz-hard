'use client'

import { GenerationProgress } from '@/components/GenerationProgress'
import { SectionCard } from '@/components/SectionCard'
import { ThemeToggle } from '@/components/ThemeToggle'
import { subscribeToRoom } from '@/lib/api'
import { getRoomFromStorage, joinRoomOnServer, saveAnswer, saveRoomToStorage } from '@/lib/storage'
import { difficultyPoints, type Player, type Room } from '@/lib/types'
import { HeadsUpCard } from '@/components/HeadsUpCard'
import { Panel } from '@/components/spaceteam/Panel'
import { SeaBattle } from '@/components/seabattle/SeaBattle'
import { InstructionCard, ShipStatus } from '@/components/spaceteam/Bridge'
import { postSpaceteamAction } from '@/lib/api'
import { MAX_HULL } from '@/lib/spaceteam'
import { useTilt } from '@/hooks/useTilt'
import { useWakeLock } from '@/hooks/useWakeLock'
import {
  cardsFor,
  currentGuesserId,
  guesserName,
  headsUpState,
  recordCard,
  scoreFor,
  wordFor,
  turnClock,
} from '@/lib/headsup'
import { generatePlayerId } from '@/lib/utils'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'

function PlayerPageContent() {
  const searchParams = useSearchParams()
  const [room, setRoom] = useState<Room | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [sessionPlayerId, setSessionPlayerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const sessionPlayerIdRef = useRef<string | null>(null)
  sessionPlayerIdRef.current = sessionPlayerId

  const [joinCode, setJoinCode] = useState('')
  const [joinName, setJoinName] = useState('')

  const currentQuestion = useMemo(
    () => (room && room.questions[room.currentIndex]) || null,
    [room],
  )

  // Check URL param for room code or encoded room config
  useEffect(() => {
    const loadRoom = async () => {
      const roomParam = searchParams?.get('room')
      const codeParam = searchParams?.get('code')
      
      if (roomParam) {
        try {
          const roomConfig = JSON.parse(atob(roomParam))
          const code = roomConfig.code.toUpperCase()
          setJoinCode(code)
          
          let foundRoom = await getRoomFromStorage(code)
          if (!foundRoom) {
            foundRoom = {
              code,
              hostName: roomConfig.hostName,
              gameMode: roomConfig.gameMode || 'standard',
              theme: roomConfig.theme,
              aiModel: roomConfig.aiModel || 'gpt-5.6-luna',
              difficulty: roomConfig.difficulty,
              questionCount: roomConfig.questionCount,
              timePerQuestion: roomConfig.timePerQuestion,
              players: [],
              questions: [],
              currentIndex: 0,
              status: 'lobby',
              responses: {},
              lastGain: {},
            }
            await saveRoomToStorage(foundRoom)
          }
          setRoom(foundRoom)
        } catch (err) {
          console.error('Failed to decode room config', err)
        }
      } else if (codeParam) {
        const code = codeParam.toUpperCase()
        setJoinCode(code)
        const foundRoom = await getRoomFromStorage(code)
        if (foundRoom) {
          setRoom(foundRoom)
        }
      }
    }
    loadRoom()
  }, [searchParams])

  useEffect(() => {
    if (room?.status === 'question' && room.gameMode !== 'headsup') {
      setTimeLeft(room.timePerQuestion)
      const ticker = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(ticker)
            return 0
          }
          return t - 1
        })
      }, 1000)
      return () => clearInterval(ticker)
    }
  }, [room?.status, room?.currentIndex, room?.timePerQuestion, room?.gameMode])

  // ---------------------------------------------------------------- Heads Up
  const hu = headsUpState(room)
  const guesserId = currentGuesserId(room)
  const isGuesser = Boolean(sessionPlayerId && guesserId === sessionPlayerId)
  const [clock, setClock] = useState({ countdown: 3, timeLeft: 0, expired: false })

  // Everyone derives the countdown from the shared start time, so the guesser
  // and the clue-givers never drift apart.
  useEffect(() => {
    if (!room || room.gameMode !== 'headsup' || room.status !== 'question') return
    const tick = () => setClock(turnClock(room.headsUp ?? null))
    tick()
    const ticker = setInterval(tick, 200)
    return () => clearInterval(ticker)
  }, [room?.status, room?.gameMode, room?.headsUp?.turnStartedAt])

  const headsUpWord =
    hu && guesserId ? wordFor(hu, guesserId) : null
  const turnLive = Boolean(
    room?.gameMode === 'headsup' && room.status === 'question' && !clock.expired,
  )

  useWakeLock(Boolean(turnLive && isGuesser))

  const decide = useCallback(
    (got: boolean) => {
      if (!room || !sessionPlayerId || !headsUpWord || clock.expired || clock.countdown > 0) return
      const updated = recordCard(room, sessionPlayerId, headsUpWord, got)
      setRoom(updated)
      saveRoomToStorage(updated).catch(console.error)
    },
    [room, sessionPlayerId, headsUpWord, clock.expired, clock.countdown],
  )

  const tilt = useTilt({
    enabled: Boolean(turnLive && isGuesser && clock.countdown === 0),
    onGot: () => decide(true),
    onPass: () => decide(false),
  })

  const joinRoom = async () => {
    console.log('[🟢 PLAYER] 🚪 Attempting to join room...')
    const code = joinCode.trim().toUpperCase()
    let foundRoom = await getRoomFromStorage(code)
    
    console.log('[🟢 PLAYER] Room found:', foundRoom ? 'YES' : 'NO')
    
    if (!foundRoom) {
      const roomParam = searchParams?.get('room')
      if (roomParam) {
        try {
          const roomConfig = JSON.parse(atob(roomParam))
          if (roomConfig.code.toUpperCase() === code) {
            console.log('[🟢 PLAYER] Creating room from URL config')
            foundRoom = {
              code,
              hostName: roomConfig.hostName,
              gameMode: roomConfig.gameMode || 'standard',
              theme: roomConfig.theme,
              aiModel: roomConfig.aiModel || 'gpt-5.6-luna',
              difficulty: roomConfig.difficulty,
              questionCount: roomConfig.questionCount,
              timePerQuestion: roomConfig.timePerQuestion,
              players: [],
              questions: [],
              currentIndex: 0,
              status: 'lobby',
              responses: {},
              lastGain: {},
            }
            await saveRoomToStorage(foundRoom)
          }
        } catch (err) {
          console.error('[🟢 PLAYER] Error decoding room config:', err)
        }
      }
    }
    
    if (!foundRoom) {
      console.error('[🟢 PLAYER] ❌ Room not found!')
      setError('Room not found. Check the code shared by the host.')
      return
    }
    
    const player: Player = {
      id: generatePlayerId(),
      name: joinName || 'Mystery Player',
      score: 0,
    }
    
    console.log('[🟢 PLAYER] Adding player:', player.name)
    
    // Append server-side. Building the list locally meant two people tapping
    // Join together each sent a list that did not know about the other, and one
    // of them silently never appeared in the host's lobby.
    const players = await joinRoomOnServer(foundRoom.code, { id: player.id, name: player.name })

    const updatedRoom: Room = {
      ...foundRoom,
      players: players ?? [...foundRoom.players, player],
      responses: { ...foundRoom.responses },
    }

    if (!players) {
      // No server (or the room only exists in this browser). Fall back to the
      // old whole-room save so single-device play still works.
      console.warn('[🟢 PLAYER] Join endpoint unavailable, saving whole room')
      await saveRoomToStorage(updatedRoom)
    }
    
    console.log('[🟢 PLAYER] ✅ Joined successfully!')
    setRoom(updatedRoom)
    setSessionPlayerId(player.id)
    setError(null)
  }

  const selectAnswer = async (choiceIdx: number) => {
    if (!room || room.status !== 'question' || timeLeft <= 0 || !sessionPlayerId) return

    // Show the pick straight away, then let the server merge it. Sending the
    // whole room here used to wipe out anyone who answered a moment earlier.
    setRoom({
      ...room,
      responses: {
        ...room.responses,
        [sessionPlayerId]: { answerIndex: choiceIdx, remaining: timeLeft },
      },
    })

    const merged = await saveAnswer(room.code, sessionPlayerId, choiceIdx, timeLeft, room.round ?? 0)
    // The merged map includes answers this phone had not seen yet.
    if (merged) setRoom((prev) => (prev ? { ...prev, responses: merged } : prev))
  }

  const inLobby = room && room.status === 'lobby'
  const inGenerating = room && room.status === 'generating'
  
  useEffect(() => {
    console.log('[🟢 PLAYER] Room status:', room?.status, 'inGenerating:', inGenerating)
  }, [room?.status, inGenerating])
  const inQuestion = room && room.status === 'question'
  const inResults = room && (room.status === 'results' || room.status === 'final')

  const sessionPlayer = room?.players.find((p) => p.id === sessionPlayerId)
  const sortedLeaderboard = room
    ? [...room.players].sort((a, b) => b.score - a.score)
    : []

  const playerResult = useMemo(() => {
    if (!sessionPlayerId || !room || !currentQuestion) return null
    const response = room.responses[sessionPlayerId]
    const wasCorrect = response?.answerIndex === currentQuestion.correctIndex
    const gain = room.lastGain[sessionPlayerId] ?? 0
    return { wasCorrect, gain }
  }, [sessionPlayerId, room, currentQuestion])

  // Real-time updates
  useEffect(() => {
    if (!room) return
    
    console.log('[🟢 PLAYER] Starting subscription for room:', room.code)
    
    const unsubscribe = subscribeToRoom(
      room.code,
      (updatedRoom) => {
        console.log('[🟢 PLAYER] 📥 Room update received!')
        setRoom((prev) => {
          // During your own Heads Up turn your device is the source of truth for
          // the cards you just decided; a slower broadcast must not undo them.
          const me = sessionPlayerIdRef.current
          if (
            me &&
            prev?.gameMode === 'headsup' &&
            updatedRoom?.gameMode === 'headsup' &&
            updatedRoom.status === 'question' &&
            prev.status === 'question' &&
            prev.headsUp?.turnStartedAt === updatedRoom.headsUp?.turnStartedAt &&
            currentGuesserId(prev) === me
          ) {
            const mine = prev.headsUp?.results?.[me] ?? []
            const incoming = updatedRoom.headsUp?.results?.[me] ?? []
            if (mine.length > incoming.length && updatedRoom.headsUp) {
              return {
                ...updatedRoom,
                headsUp: {
                  ...updatedRoom.headsUp,
                  results: { ...updatedRoom.headsUp.results, [me]: mine },
                },
              }
            }
          }
          return updatedRoom
        })
      },
      (error) => {
        console.error('[🟢 PLAYER] ❌ SSE error:', error)
      }
    )
    
    return () => {
      console.log('[🟢 PLAYER] Unsubscribing')
      unsubscribe()
    }
  }, [room?.code])

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <p className="text-xs uppercase tracking-[0.4em] text-primary/80">Party Quiz</p>
            <h1 className="text-3xl font-bold sm:text-4xl">Nix Games</h1>
            {/* <p className="text-sm text-slate-300">Jackbox-style room play with AI-authored trivia.</p> */}
          </Link>
          <ThemeToggle />
        </header>

        {/* Show Join a Lobby form when not joined yet */}
        {!sessionPlayerId && (
          <SectionCard title="Join a lobby" accent="from-secondary/20 to-primary/20">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Room Code"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-center text-lg tracking-[0.3em]"
              />
              <input
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-3"
              />
              <button
                onClick={joinRoom}
                className="rounded-xl bg-secondary px-4 py-3 text-lg font-semibold text-slate-900 shadow-lg transition hover:scale-[1.01] hover:bg-secondary/80"
              >
                Join Room
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            {room && !sessionPlayerId && (
              <div className="mt-3 text-sm text-white/70 light:text-black/70">
                Found room: <span className="font-semibold">{room.code}</span> • Host {room.hostName}
              </div>
            )}
          </SectionCard>
        )}

        {/* Generating Questions View */}

        {room && inGenerating && (
          <SectionCard title="🎮 Get Ready!" accent="from-primary/30 to-secondary/30">
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-white light:text-black mb-2">
                  🔥 AI is cooking up some questions... 🔥
                </h3>
                <p className="text-sm text-white/70 light:text-black/70">
                  {room.hostName} is generating {room.questionCount} {room.difficulty} questions about {room.generatedTheme || room.theme}
                </p>
              </div>

              {/* Progress Bar - same component the host sees, so the two
                  cannot drift on timing or on what 100% means. */}
              <GenerationProgress durationMs={10000} active={Boolean(inGenerating)} />

              <div className="text-center space-y-1">
                <p className="text-lg font-semibold text-white/80 light:text-black/80">✨ Takes about 10 seconds</p>
                <p className="text-sm text-white/60 light:text-black/60">Stay sharp! Game starts soon...</p>
              </div>
            </div>
          </SectionCard>
        )}

        {/* Sea Battle: two hidden fleets. Your own board never leaves the server. */}
        {room && room.gameMode === 'seabattle' && room.seaBattle && sessionPlayerId &&
          (inQuestion || room.status === 'final') && (
            <SeaBattle
              code={room.code}
              playerId={sessionPlayerId}
              state={room.seaBattle}
              names={Object.fromEntries(room.players.map((p) => [p.id, p.name]))}
              onState={(next) => setRoom((prev) => (prev ? { ...prev, seaBattle: next } : prev))}
            />
          )}

        {/* Spaceteam: your panel, and an instruction that is probably not yours. */}
        {room && room.gameMode === 'spaceteam' && room.spaceteam && sessionPlayerId &&
          (inQuestion || room.status === 'final') && (
            <div className="grid gap-3">
              {room.spaceteam.outcome === 'flying' ? (
                <>
                  <InstructionCard instruction={room.spaceteam.instructions[sessionPlayerId] ?? null} />
                  <ShipStatus state={room.spaceteam} compact />
                  <Panel
                    controls={room.spaceteam.panels[sessionPlayerId] ?? []}
                    onAction={(controlId, value) =>
                      void postSpaceteamAction(room.code, {
                        playerId: sessionPlayerId,
                        controlId,
                        value,
                        seq: Date.now() * 1000 + Math.floor(Math.random() * 1000),
                      })
                    }
                  />
                </>
              ) : (
                <SectionCard
                  title={room.spaceteam.outcome === 'won' ? '🎉 You made it' : '💥 The ship is gone'}
                  accent="from-primary/30 to-secondary/30"
                >
                  <p className="text-center text-lg">
                    {room.spaceteam.outcome === 'won'
                      ? `Cleared all ${room.spaceteam.level} levels with ${Math.round((room.spaceteam.hull / MAX_HULL) * 100)}% hull left.`
                      : `Broke apart on level ${room.spaceteam.level} after ${room.spaceteam.completed} instructions.`}
                  </p>
                  <p className="mt-2 text-center text-sm text-white/60">
                    Waiting for {room.hostName} to launch again…
                  </p>
                </SectionCard>
              )}
            </div>
          )}

        {/* Heads Up: the guesser's phone takes over the whole screen. */}
        {room && room.gameMode === 'headsup' && inQuestion && hu && isGuesser && headsUpWord && !clock.expired && (
          <HeadsUpCard
            word={headsUpWord}
            timeLeft={clock.timeLeft}
            roundSeconds={hu.roundSeconds}
            countdown={clock.countdown}
            cardsLeft={Math.max(0, hu.words.length - hu.cardIndex - cardsFor(hu, sessionPlayerId || '').length)}
            score={scoreFor(hu, sessionPlayerId || '')}
            tiltStatus={tilt.status}
            onEnableTilt={() => void tilt.request()}
            onGot={() => decide(true)}
            onPass={() => decide(false)}
          />
        )}

        {/* Heads Up: the guesser ran out of deck. */}
        {room && room.gameMode === 'headsup' && inQuestion && hu && isGuesser && !headsUpWord && (
          <SectionCard title="Deck finished" accent="from-secondary/20 to-primary/20">
            <p className="text-center text-lg">You got through the whole deck. Hand the phone back.</p>
          </SectionCard>
        )}

        {/* Heads Up: everyone else shouts clues. */}
        {room && room.gameMode === 'headsup' && inQuestion && hu && !isGuesser && (
          <SectionCard
            title={clock.countdown > 0 ? 'Get ready' : `Give clues to ${guesserName(room)}`}
            accent="from-primary/30 to-secondary/30"
          >
            {clock.countdown > 0 ? (
              <div className="py-10 text-center">
                <p className="text-7xl font-black text-primary">{clock.countdown}</p>
                <p className="mt-4 text-white/60">{guesserName(room)} is putting the phone on their forehead</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-4xl font-black leading-tight sm:text-6xl">{headsUpWord ?? 'Deck finished'}</p>
                <p className="mt-4 text-sm text-white/60">Describe it without saying the word</p>
                <div className="mt-6 flex items-center justify-center gap-6 text-sm">
                  <span className="text-white/60">
                    {guesserId ? scoreFor(hu, guesserId) : 0} correct
                  </span>
                  <span className={`text-3xl font-bold ${clock.timeLeft <= 10 ? 'text-danger' : 'text-secondary'}`}>
                    {clock.timeLeft}s
                  </span>
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {/* Heads Up: turn summary, same on every device. */}
        {room && room.gameMode === 'headsup' && room.status === 'results' && hu && guesserId && (
          <SectionCard
            title={`${guesserName(room)} scored ${room.lastGain[guesserId] ?? 0}`}
            accent="from-secondary/20 to-primary/20"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {cardsFor(hu, guesserId).map((card, idx) => (
                <div
                  key={`${card.word}-${idx}`}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    card.got ? 'bg-secondary/15 text-secondary' : 'bg-white/5 text-white/50 line-through'
                  }`}
                >
                  <span>{card.word}</span>
                  <span>{card.got ? '✓' : 'passed'}</span>
                </div>
              ))}
              {cardsFor(hu, guesserId).length === 0 && <p className="text-sm text-white/60">No cards played.</p>}
            </div>
            <p className="mt-4 text-center text-sm text-white/60">Waiting for {room.hostName} to start the next turn…</p>
          </SectionCard>
        )}

        {/* Heads Up: final leaderboard */}
        {room && room.gameMode === 'headsup' && room.status === 'final' && (
          <SectionCard title="Final leaderboard" accent="from-secondary/30 to-primary/30">
            <div className="grid gap-2">
              {sortedLeaderboard.map((p, idx) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                    idx === 0 ? 'bg-gradient-to-r from-secondary/25 to-primary/25' : 'bg-white/5'
                  } ${p.id === sessionPlayerId ? 'ring-1 ring-primary/50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-white/50">#{idx + 1}</span>
                    <span className="font-semibold">{p.name}</span>
                  </div>
                  <span className="font-bold">{p.score}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {room && inQuestion && currentQuestion && (
          <SectionCard title={`Question ${room.currentIndex + 1} / ${room.questions.length}`} accent="from-primary/30 to-secondary/30">
            <div className="grid gap-4 md:grid-cols-[2fr,1fr] md:items-start">
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold leading-tight">{currentQuestion.question}</h2>
                <div className="grid gap-2">
                  {currentQuestion.choices.map((choice, idx) => {
                    const selected = sessionPlayerId && room.responses[sessionPlayerId]?.answerIndex === idx
                    return (
                      <button
                        key={idx}
                        onClick={() => selectAnswer(idx)}
                        disabled={timeLeft <= 0}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                          selected
                            ? 'border-secondary bg-secondary/20 text-secondary'
                            : 'border-white/10 bg-white/5 hover:border-primary/40'
                        } ${timeLeft <= 0 ? 'opacity-50' : ''}`}
                      >
                        <span>{choice}</span>
                        {selected && <span className="text-xs">Locked in</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-3 rounded-xl bg-white/5 p-4">
                <div className="text-sm uppercase tracking-[0.3em] text-white/60">Countdown</div>
                <div className="rounded-lg bg-black/40 px-4 py-3">
                  <span className="text-4xl font-bold text-secondary">{timeLeft}s</span>
                </div>
                <div className="text-sm text-white/70">
                  Points: <span className="font-semibold">{difficultyPoints[room.difficulty]}</span> + speed bonus
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {room && inResults && currentQuestion && (
          <SectionCard
            title={room.status === 'final' ? 'Final Leaderboard' : 'Round results'}
            accent="from-secondary/30 to-primary/20"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-xl font-semibold">Correct answer</h3>
                <div className="rounded-xl bg-white/5 p-4">
                  <p className="text-sm text-white/60">{currentQuestion.question}</p>
                  <p className="mt-2 text-lg font-semibold text-secondary">
                    {currentQuestion.choices[currentQuestion.correctIndex]}
                  </p>
                </div>
                {playerResult && (
                  <div className="rounded-xl bg-black/50 p-4">
                    <p className="text-sm text-white/70">
                      {room.gameMode === 'personality'
                        ? (playerResult.wasCorrect ? 'You voted with the majority 🙌' : 'You voted differently 🤷')
                        : (playerResult.wasCorrect ? 'You were correct 🎉' : 'You were wrong 😅')}
                    </p>
                    <p className="text-lg font-semibold text-secondary">+{playerResult.gain} pts</p>
                    <p className="text-sm text-white/60">
                      Total score: {sessionPlayer?.score ?? 0} pts
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-xl font-semibold">Leaderboard</h3>
                <div className="grid gap-2">
                  {sortedLeaderboard.map((p, idx) => {
                    // What everyone scored on the round just played, not only
                    // the running total - otherwise a good answer is invisible.
                    const gain = room.lastGain?.[p.id] ?? 0
                    const answered = Boolean(room.responses[p.id])
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between rounded-xl border border-white/5 px-4 py-3 ${
                          idx === 0 ? 'bg-gradient-to-r from-secondary/20 to-primary/20' : 'bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-white/50">#{idx + 1}</span>
                          <span className="font-semibold">
                            {p.name}
                            {p.id === sessionPlayerId && (
                              <span className="ml-1 text-xs text-white/50">(you)</span>
                            )}
                          </span>
                          <span
                            className={`text-sm font-semibold ${
                              gain > 0 ? 'text-secondary' : 'text-white/40'
                            }`}
                          >
                            {gain > 0 ? `+${gain}` : answered ? 'wrong' : 'no answer'}
                          </span>
                        </div>
                        <div className="text-sm font-semibold">{p.score} pts</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {room && inLobby && sessionPlayerId && (
          <SectionCard title="Lobby status" accent="from-primary/10 to-secondary/10">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-white/5 p-3 text-sm">
                <div className="text-white/60">Room</div>
                <div className="text-xl font-semibold tracking-[0.2em]">{room.code}</div>
              </div>
              <div className="rounded-lg bg-white/5 p-3 text-sm">
                <div className="text-white/60">Theme</div>
                <div className="text-lg font-semibold">{room.generatedTheme || room.theme}</div>
              </div>
              <div className="rounded-lg bg-white/5 p-3 text-sm">
                <div className="text-white/60">Difficulty</div>
                <div className="text-lg font-semibold capitalize text-primary">{room.difficulty}</div>
              </div>
            </div>
            <p className="mt-3 text-white/70">
              Waiting for host to start the game…
            </p>
            <div className="mt-3 grid gap-2 rounded-xl bg-white/5 p-3">
              {room.players.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-white/80">
                  <span>{p.name}</span>
                  <span className="text-sm text-white/60">{p.score} pts</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        <footer className="pb-8 text-center text-xs text-white/40">
          © {new Date().getFullYear()} - Nico Vincent
        </footer>
      </div>
    </div>
  )
}

export default function PlayerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    }>
      <PlayerPageContent />
    </Suspense>
  )
}

