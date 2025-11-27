'use client'

import { SectionCard } from '@/components/SectionCard'
import { subscribeToRoom } from '@/lib/api'
import { fetchQuestionsFromChatGPT } from '@/lib/questions'
import { saveRoomToStorage } from '@/lib/storage'
import { difficultyPoints, themes, type Difficulty, type Player, type Room } from '@/lib/types'
import { generatePlayerId, generateRoomCode } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

export default function AdminPage() {
  const router = useRouter()
  const [room, setRoom] = useState<Room | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [sessionPlayerId, setSessionPlayerId] = useState<string | null>(null)
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [shareLink, setShareLink] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const [hostName, setHostName] = useState('Nico')
  const [theme, setTheme] = useState(themes[0])
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [questionCount, setQuestionCount] = useState(8)
  const [timePerQuestion, setTimePerQuestion] = useState(8)

  const currentQuestion = useMemo(
    () => (room && room.questions[room.currentIndex]) || null,
    [room],
  )

  useEffect(() => {
    if (room?.status === 'question') {
      setTimeLeft(room.timePerQuestion)
      const ticker = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(ticker)
            endQuestion()
            return 0
          }
          return t - 1
        })
      }, 1000)
      return () => clearInterval(ticker)
    }
  }, [room?.status, room?.currentIndex, room?.timePerQuestion])

  const createRoom = async () => {
    const code = generateRoomCode()
    const player: Player = {
      id: generatePlayerId('host'),
      name: hostName || 'Host',
      score: 0,
    }
    const newRoom: Room = {
      code,
      hostName: hostName || 'Host',
      theme,
      difficulty,
      questionCount,
      timePerQuestion,
      players: [player],
      questions: [],
      currentIndex: 0,
      status: 'lobby',
      responses: {},
      lastGain: {},
    }
    await saveRoomToStorage(newRoom)
    setRoom(newRoom)
    setSessionPlayerId(player.id)
    
    // Generate share link
    const roomConfig = {
      code,
      hostName: hostName || 'Host',
      theme,
      difficulty,
      questionCount,
      timePerQuestion,
    }
    const encoded = btoa(JSON.stringify(roomConfig))
    const link = `${window.location.origin}/?room=${encoded}`
    setShareLink(link)
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const startGame = async () => {
    if (!room) return
    setLoadingQuestions(true)
    const questions = await fetchQuestionsFromChatGPT(room.theme, room.difficulty, room.questionCount)
    setLoadingQuestions(false)
    const updatedRoom: Room = {
      ...room,
      questions,
      currentIndex: 0,
      status: 'question',
      responses: {},
      lastGain: {},
    }
    await saveRoomToStorage(updatedRoom)
    setRoom(updatedRoom)
  }

  const endQuestion = useCallback(async () => {
    setRoom((prev) => {
      if (!prev || prev.status !== 'question' || !prev.questions.length) return prev
      const q = prev.questions[prev.currentIndex]
      if (!q) return prev

      const lastGain: Record<string, number> = {}
      const players = prev.players.map((p) => {
        const response = prev.responses[p.id]
        const correct = response?.answerIndex === q.correctIndex
        const gain = correct
          ? difficultyPoints[prev.difficulty] + Math.max(0, Math.round(response.remaining))
          : 0
        lastGain[p.id] = gain
        return { ...p, score: p.score + gain }
      })

      const finished = prev.currentIndex >= prev.questions.length - 1
      const updated: Room = {
        ...prev,
        players,
        lastGain,
        status: finished ? 'final' : 'results',
      }
      saveRoomToStorage(updated).catch(console.error)
      return updated
    })
  }, [])

  const nextQuestion = () => {
    setRoom((prev) => {
      if (!prev) return prev
      const nextIndex = prev.currentIndex + 1
      if (nextIndex >= prev.questions.length) {
        const finalRoom = { ...prev, status: 'final' as const }
        saveRoomToStorage(finalRoom).catch(console.error)
        return finalRoom
      }
      const updated: Room = {
        ...prev,
        currentIndex: nextIndex,
        status: 'question' as const,
        responses: {},
      }
      saveRoomToStorage(updated).catch(console.error)
      return updated
    })
  }

  const selectAnswer = (choiceIdx: number) => {
    if (!room || room.status !== 'question' || timeLeft <= 0 || !sessionPlayerId) return
    const updated: Room = {
      ...room,
      responses: {
        ...room.responses,
        [sessionPlayerId]: { answerIndex: choiceIdx, remaining: timeLeft },
      },
    }
    setRoom(updated)
    saveRoomToStorage(updated).catch(console.error)
  }

  const resetScores = (resetPoints: boolean) => {
    if (!room) return
    const updated: Room = {
      ...room,
      players: room.players.map((p) => ({ ...p, score: resetPoints ? 0 : p.score })),
      currentIndex: 0,
      questions: [],
      status: 'lobby',
      responses: {},
      lastGain: {},
    }
    setRoom(updated)
    saveRoomToStorage(updated).catch(console.error)
    setTimeLeft(0)
  }

  const copyShareLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  const inLobby = room && room.status === 'lobby'
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
    
    console.log('[🔵 ADMIN] Starting subscription for room:', room.code)
    
    const unsubscribe = subscribeToRoom(
      room.code,
      (updatedRoom) => {
        console.log('[🔵 ADMIN] 📥 Room update received!')
        setRoom(updatedRoom)
      },
      (error) => {
        console.error('[🔵 ADMIN] ❌ SSE error:', error)
      }
    )
    
    return () => {
      console.log('[🔵 ADMIN] Unsubscribing')
      unsubscribe()
    }
  }, [room?.code])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#312e81,_#0f172a_45%,_#020617)] text-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-primary/80">Party Quiz</p>
            <h1 className="text-3xl font-bold sm:text-4xl">Nix Games</h1>
            <p className="text-sm text-slate-300">Jackbox-style room play with AI-authored trivia.</p>
          </div>
          <div className="hidden text-sm text-white/70 sm:block">Admin Panel</div>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Host setup">
            <div className="grid gap-3">
              <label className="text-sm text-slate-300">Your name</label>
              <input
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="Admin name"
              />

              <label className="text-sm text-slate-300">Theme</label>
              <select
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                {themes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>

              <label className="text-sm text-slate-300">Difficulty</label>
              <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold">
                {(['easy', 'medium', 'hard', 'impossible'] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`rounded-lg px-2 py-2 capitalize transition ${
                      difficulty === d
                        ? 'bg-primary text-white shadow'
                        : 'bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-300">Number of questions</p>
                  <input
                    type="number"
                    min={3}
                    max={15}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                  />
                </div>
                <div>
                  <p className="text-slate-300">Time per question (s)</p>
                  <input
                    type="number"
                    min={8}
                    max={45}
                    value={timePerQuestion}
                    onChange={(e) => setTimePerQuestion(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                  />
                </div>
              </div>

              <button
                className="mt-2 w-full rounded-xl bg-gradient-to-r from-primary to-secondary px-4 py-3 text-lg font-semibold text-white shadow-lg transition hover:scale-[1.01]"
                onClick={createRoom}
                disabled={!!room}
              >
                {room ? 'Room Created' : 'Generate Room'}
              </button>
            </div>
          </SectionCard>

          {room && (
            <SectionCard title="Lobby" accent="from-secondary/20 to-primary/10">
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Room Code</span>
                  <span className="rounded-lg bg-white/10 px-3 py-1 text-lg font-bold tracking-[0.2em]">
                    {room.code}
                  </span>
                </div>
                <div className="flex items-center justify-between text-white/80">
                  <span>Players</span>
                  <span className="font-semibold">{room.players.length}</span>
                </div>
                <div className="grid gap-2 rounded-lg bg-white/5 p-3">
                  {room.players.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-white/80">
                      <span>{p.name}</span>
                      <span className="text-sm text-white/60">{p.score} pts</span>
                    </div>
                  ))}
                </div>
                <button
                  disabled={!room.players.length || loadingQuestions}
                  onClick={startGame}
                  className={`w-full rounded-xl px-4 py-3 text-lg font-semibold transition ${
                    !room.players.length
                      ? 'cursor-not-allowed bg-white/10 text-white/50'
                      : 'bg-primary text-white shadow-lg hover:scale-[1.01]'
                  }`}
                >
                  {loadingQuestions ? 'Summoning AI questions…' : 'Start Game'}
                </button>
              </div>
            </SectionCard>
          )}

          {room && (
            <SectionCard title="Share with players" accent="from-primary/20 to-secondary/30">
              <p className="text-sm text-white/70">Share this link with players to join automatically.</p>
              <div className="mt-3 grid gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <input
                    readOnly
                    value={shareLink}
                    className="flex-1 bg-transparent text-sm font-mono text-white/80 outline-none"
                  />
                  <button
                    onClick={copyShareLink}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                      copied
                        ? 'bg-secondary text-slate-900'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        {room && inQuestion && currentQuestion && (
          <SectionCard title={`Question ${room.currentIndex + 1} / ${room.questions.length}`} accent="from-primary/30 to-secondary/30">
            <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
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
                {room.status !== 'final' && (
                  <button
                    onClick={nextQuestion}
                    className="rounded-xl bg-primary px-4 py-3 text-lg font-semibold text-white shadow-lg transition hover:scale-[1.01]"
                  >
                    Next Question
                  </button>
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

                {room.status === 'final' && (
                  <div className="space-y-2">
                    <button
                      onClick={() => resetScores(false)}
                      className="w-full rounded-xl bg-secondary px-4 py-3 text-lg font-semibold text-slate-900 shadow-lg transition hover:scale-[1.01]"
                    >
                      New Game (keep scores)
                    </button>
                    <button
                      onClick={() => resetScores(true)}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-lg font-semibold text-white shadow-lg transition hover:scale-[1.01]"
                    >
                      Reset scores & restart
                    </button>
                  </div>
                )}
              </div>
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

