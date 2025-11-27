'use client'

import { SectionCard } from '@/components/SectionCard'
import { ThemeToggle } from '@/components/ThemeToggle'
import { subscribeToRoom } from '@/lib/api'
import { getRoomFromStorage, saveRoomToStorage } from '@/lib/storage'
import { difficultyPoints, type Player, type Room } from '@/lib/types'
import { generatePlayerId } from '@/lib/utils'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'

function PlayerPageContent() {
  const searchParams = useSearchParams()
  const [room, setRoom] = useState<Room | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [sessionPlayerId, setSessionPlayerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  
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
              aiModel: roomConfig.aiModel || 'gpt-4o-mini',
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
    if (room?.status === 'question') {
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
  }, [room?.status, room?.currentIndex, room?.timePerQuestion])

  // Loading progress bar animation (10 seconds)
  useEffect(() => {
    if (room?.status === 'generating') {
      console.log('[🟢 PLAYER] 📊 Starting progress bar animation!')
      setLoadingProgress(0)
      const startTime = Date.now()
      const duration = 10000 // 10 seconds
      
      const ticker = setInterval(() => {
        const elapsed = Date.now() - startTime
        const progress = Math.min((elapsed / duration) * 100, 100)
        setLoadingProgress(progress)
        console.log('[🟢 PLAYER] Progress:', Math.round(progress) + '%')
        
        if (progress >= 100) {
          clearInterval(ticker)
        }
      }, 100) // Update every 100ms for smooth animation
      
      return () => clearInterval(ticker)
    } else {
      setLoadingProgress(0)
    }
  }, [room?.status])

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
              aiModel: roomConfig.aiModel || 'gpt-4o-mini',
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
    
    const updatedRoom: Room = {
      ...foundRoom,
      players: [...foundRoom.players, player],
      responses: { ...foundRoom.responses },
    }
    
    console.log('[🟢 PLAYER] 💾 Saving room with', updatedRoom.players.length, 'players')
    await saveRoomToStorage(updatedRoom)
    
    console.log('[🟢 PLAYER] ✅ Joined successfully!')
    setRoom(updatedRoom)
    setSessionPlayerId(player.id)
    setError(null)
  }

  const selectAnswer = async (choiceIdx: number) => {
    if (!room || room.status !== 'question' || timeLeft <= 0 || !sessionPlayerId) return
    const updated: Room = {
      ...room,
      responses: {
        ...room.responses,
        [sessionPlayerId]: { answerIndex: choiceIdx, remaining: timeLeft },
      },
    }
    setRoom(updated)
    await saveRoomToStorage(updated)
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
        setRoom(updatedRoom)
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

        {/* DEBUG: Show room status */}
        {room && (
          <div className="fixed bottom-4 right-4 bg-black/80 text-white p-2 rounded text-xs">
            Status: {room.status} | Progress: {Math.round(loadingProgress)}%
          </div>
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

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-6 w-full rounded-full bg-white/10 overflow-hidden border-2 border-primary/30">
                  <div
                    className="h-full bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_100%] animate-gradient transition-all duration-300 ease-out"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-lg font-bold text-primary">
                  <span>Generating...</span>
                  <span>{Math.round(loadingProgress)}%</span>
                </div>
              </div>

              <div className="text-center space-y-1">
                <p className="text-lg font-semibold text-white/80 light:text-black/80">✨ Takes about 10 seconds</p>
                <p className="text-sm text-white/60 light:text-black/60">Stay sharp! Game starts soon...</p>
              </div>
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
                      You were {playerResult.wasCorrect ? 'correct 🎉' : 'wrong 😅'}
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
                  {sortedLeaderboard.map((p, idx) => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between rounded-xl border border-white/5 px-4 py-3 ${
                        idx === 0 ? 'bg-gradient-to-r from-secondary/20 to-primary/20' : 'bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-white/50">#{idx + 1}</span>
                        <span className="font-semibold">{p.name}</span>
                      </div>
                      <div className="text-sm font-semibold">{p.score} pts</div>
                    </div>
                  ))}
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
          © 2025 - Nico Vincent
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

