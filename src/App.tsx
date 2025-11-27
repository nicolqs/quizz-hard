import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'

type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible'

const difficultyPoints: Record<Difficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 35,
  impossible: 50,
}

type Question = {
  question: string
  choices: string[]
  correctIndex: number
  explanation?: string
}

type Player = {
  id: string
  name: string
  score: number
}

type Response = {
  answerIndex: number
  remaining: number
}

type Room = {
  code: string
  hostName: string
  theme: string
  difficulty: Difficulty
  questionCount: number
  timePerQuestion: number
  players: Player[]
  questions: Question[]
  currentIndex: number
  status: 'lobby' | 'question' | 'results' | 'final'
  responses: Record<string, Response>
  lastGain: Record<string, number>
}

const themes = [
  'General Knowledge',
  'History',
  'Geography',
  'Movies',
  'TV Shows',
  'Music',
  'Sports',
  'Science',
  'Technology',
  'Video Games',
  'Internet Culture & Memes',
  'Animals & Nature',
  'Food & Cooking',
  'Travel & World Cities',
  'Literature & Books',
  'Art & Famous Paintings',
  'Fashion & Style',
  'Business & Startups',
  'Crypto & Web3',
  'Fitness & Health',
  'Guess the Emoji Meaning',
  'Name That Song',
  'Riddles & Brain Teasers',
  'This or That',
]

const fallbackBank: Question[] = [
  {
    question: 'Which planet is known as the Red Planet?',
    choices: ['Mars', 'Venus', 'Jupiter', 'Mercury'],
    correctIndex: 0,
  },
  {
    question: 'What is the capital of Australia?',
    choices: ['Sydney', 'Melbourne', 'Canberra', 'Perth'],
    correctIndex: 2,
  },
  {
    question: 'Which composer wrote the Four Seasons?',
    choices: ['Mozart', 'Vivaldi', 'Bach', 'Beethoven'],
    correctIndex: 1,
  },
  {
    question: 'What does CPU stand for?',
    choices: [
      'Central Processing Unit',
      'Computer Personal Utility',
      'Central Parallel Utility',
      'Core Processing Usage',
    ],
    correctIndex: 0,
  },
  {
    question: 'Which movie features the quote "May the Force be with you"?',
    choices: ['Star Trek', 'Avatar', 'Star Wars', 'Dune'],
    correctIndex: 2,
  },
]

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || 'YOUR_KEY_HERE'

async function fetchQuestionsFromChatGPT(
  theme: string,
  difficulty: Difficulty,
  count: number,
): Promise<Question[]> {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_KEY_HERE') {
    return Array.from({ length: count }, (_, i) =>
      fallbackBank[i % fallbackBank.length],
    )
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You generate lively multiple-choice trivia. Answer ONLY with valid JSON.',
          },
          {
            role: 'user',
            content: `Create ${count} ${difficulty} trivia questions about ${theme}. Respond with a JSON array where each item has {"question": string, "choices": [4 strings], "correctIndex": 0-3}. Keep text concise.`,
          },
        ],
        temperature: 0.8,
      }),
    })

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    const parsed: Question[] = JSON.parse(content || '[]')
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Bad format')
    return parsed.slice(0, count)
  } catch (err) {
    console.error('ChatGPT fetch failed, using fallback', err)
    return Array.from({ length: count }, (_, i) =>
      fallbackBank[(i + 1) % fallbackBank.length],
    )
  }
}

const SectionCard: React.FC<{ title: string; children: React.ReactNode; accent?: string }> = ({
  title,
  children,
  accent = 'from-primary/30 to-secondary/20',
}) => (
  <div className="glass fade-card rounded-2xl border border-white/10 p-5 shadow-lg">
    <div className={`mb-3 text-sm uppercase tracking-[0.3em] text-white/60`}>
      {title}
    </div>
    <div className={`rounded-xl bg-gradient-to-r ${accent} p-[1px]`}>
      <div className="rounded-[10px] bg-black/60 p-4">{children}</div>
    </div>
  </div>
)

// Store rooms in localStorage for demo purposes
const ROOM_STORAGE_KEY = 'nix-games-rooms'

function getRoomFromStorage(code: string): Room | null {
  try {
    const stored = localStorage.getItem(ROOM_STORAGE_KEY)
    if (!stored) return null
    const rooms: Record<string, Room> = JSON.parse(stored)
    return rooms[code] || null
  } catch {
    return null
  }
}

function saveRoomToStorage(room: Room) {
  try {
    const stored = localStorage.getItem(ROOM_STORAGE_KEY)
    const rooms: Record<string, Room> = stored ? JSON.parse(stored) : {}
    rooms[room.code] = room
    localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(rooms))
  } catch {
    // ignore
  }
}

function updateRoomInStorage(room: Room) {
  saveRoomToStorage(room)
}

function AdminPage() {
  const navigate = useNavigate()
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
  const [timePerQuestion, setTimePerQuestion] = useState(20)

  const currentQuestion = useMemo(
    () => (room && room.questions[room.currentIndex]) || null,
    [room],
  )

  useEffect(() => {
    if (room) {
      saveRoomToStorage(room)
    }
  }, [room])

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

  const createRoom = () => {
    const code = Math.random().toString(36).slice(2, 7).toUpperCase()
    const player: Player = {
      id: `host-${Date.now()}`,
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
    setRoom(newRoom)
    setSessionPlayerId(player.id)
    
    // Generate share link with room config encoded in URL
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
    setRoom((prev) =>
      prev
        ? {
            ...prev,
            theme,
            difficulty,
            questionCount,
            timePerQuestion,
            questions,
            currentIndex: 0,
            status: 'question',
            responses: {},
            lastGain: {},
          }
        : prev,
    )
  }

  const endQuestion = useCallback(() => {
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
      updateRoomInStorage(updated)
      return updated
    })
  }, [])

  const nextQuestion = () => {
    setRoom((prev) => {
      if (!prev) return prev
      const nextIndex = prev.currentIndex + 1
      if (nextIndex >= prev.questions.length) return { ...prev, status: 'final' as const }
      const updated: Room = {
        ...prev,
        currentIndex: nextIndex,
        status: 'question' as const,
        responses: {},
      }
      updateRoomInStorage(updated)
      return updated
    })
  }

  const selectAnswer = (choiceIdx: number) => {
    if (!room || room.status !== 'question' || timeLeft <= 0 || !sessionPlayerId) return
    setRoom((prev) =>
      prev
        ? {
            ...prev,
            responses: {
              ...prev.responses,
              [sessionPlayerId]: { answerIndex: choiceIdx, remaining: timeLeft },
            },
          }
        : prev,
    )
  }

  const resetScores = (resetPoints: boolean) => {
    setRoom((prev) =>
      prev
        ? {
            ...prev,
            players: prev.players.map((p) => ({ ...p, score: resetPoints ? 0 : p.score })),
            currentIndex: 0,
            questions: [],
            status: 'lobby',
            responses: {},
            lastGain: {},
          }
        : prev,
    )
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
    ? [...room.players].sort((a, b) => b.score - a.score).slice(0, room.players.length)
    : []

  const playerResult = useMemo(() => {
    if (!sessionPlayerId || !room || !currentQuestion) return null
    const response = room.responses[sessionPlayerId]
    const wasCorrect = response?.answerIndex === currentQuestion.correctIndex
    const gain = room.lastGain[sessionPlayerId] ?? 0
    return { wasCorrect, gain }
  }, [sessionPlayerId, room, currentQuestion])

  // Poll for room updates (for player joins)
  useEffect(() => {
    if (!room) return
    const interval = setInterval(() => {
      const updated = getRoomFromStorage(room.code)
      if (updated) {
        setRoom(updated)
      }
    }, 1000)
    return () => clearInterval(interval)
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
                  <span>Theme</span>
                  <span className="font-semibold">{room.theme}</span>
                </div>
                <div className="flex items-center justify-between text-white/80">
                  <span>Difficulty</span>
                  <span className="capitalize text-primary font-semibold">{room.difficulty}</span>
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
                <p className="text-xs text-white/60">
                  Link copied to clipboard automatically when room was created.
                </p>
              </div>
            </SectionCard>
          )}
        </div>

        {room && inQuestion && currentQuestion && (
          <SectionCard title={`Question ${room.currentIndex + 1} / ${room.questions.length}`} accent="from-primary/30 to-secondary/30">
            <div className="grid gap-4 md:grid-cols-[2fr,1fr] md:items-start">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-primary/20 px-3 py-1 text-primary">{room.theme}</span>
                  <span className="rounded-full bg-white/10 px-3 py-1 capitalize text-white/80">
                    {room.difficulty}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-white/80">{room.timePerQuestion}s</span>
                </div>
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
                <div className="flex items-center justify-between rounded-lg bg-black/40 px-4 py-3">
                  <span className="text-4xl font-bold text-secondary">{timeLeft}s</span>
                  <div className="h-3 flex-1 rounded-full bg-white/10">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-secondary to-primary"
                      style={{ width: `${(timeLeft / room.timePerQuestion) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm text-white/70">
                  Points this round: <span className="font-semibold">{difficultyPoints[room.difficulty]}</span> + remaining seconds bonus
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
            <div className="grid gap-4 md:grid-cols-[2fr,1fr] md:items-start">
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
                        idx === 0
                          ? 'bg-gradient-to-r from-secondary/20 to-primary/20'
                          : 'bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-white/50">#{idx + 1}</span>
                        <span className="font-semibold">{p.name}</span>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-semibold">{p.score} pts</div>
                        {room.lastGain[p.id] !== undefined && (
                          <div className="text-secondary">+{room.lastGain[p.id]} this round</div>
                        )}
                      </div>
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
          {/* <!-- — Why did the quiz break up with the answer? It couldn't find the right match! 🎯 --> */}
        </footer>
      </div>
    </div>
  )
}

function PlayerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [room, setRoom] = useState<Room | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [sessionPlayerId, setSessionPlayerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [joinCode, setJoinCode] = useState('')
  const [joinName, setJoinName] = useState('')

  const currentQuestion = useMemo(
    () => (room && room.questions[room.currentIndex]) || null,
    [room],
  )

  // Check URL param for room code or encoded room config
  useEffect(() => {
    const roomParam = searchParams.get('room')
    const codeParam = searchParams.get('code')
    
    if (roomParam) {
      // Decode room config from URL
      try {
        const roomConfig = JSON.parse(atob(roomParam))
        const code = roomConfig.code.toUpperCase()
        setJoinCode(code)
        
        // Try to get existing room from storage, or create from config
        let foundRoom = getRoomFromStorage(code)
        if (!foundRoom) {
          // Create room from URL config
          foundRoom = {
            code,
            hostName: roomConfig.hostName,
            theme: roomConfig.theme,
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
          saveRoomToStorage(foundRoom)
        }
        setRoom(foundRoom)
      } catch (err) {
        console.error('Failed to decode room config', err)
      }
    } else if (codeParam) {
      // Legacy support for code-only URLs
      const code = codeParam.toUpperCase()
      setJoinCode(code)
      const foundRoom = getRoomFromStorage(code)
      if (foundRoom) {
        setRoom(foundRoom)
      }
    }
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

  const joinRoom = () => {
    const code = joinCode.trim().toUpperCase()
    let foundRoom = getRoomFromStorage(code)
    
    // If room doesn't exist, try to get from URL
    if (!foundRoom) {
      const roomParam = searchParams.get('room')
      if (roomParam) {
        try {
          const roomConfig = JSON.parse(atob(roomParam))
          if (roomConfig.code.toUpperCase() === code) {
            foundRoom = {
              code,
              hostName: roomConfig.hostName,
              theme: roomConfig.theme,
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
            saveRoomToStorage(foundRoom)
          }
        } catch (err) {
          // ignore
        }
      }
    }
    
    if (!foundRoom) {
      setError('Room not found. Check the code shared by the host.')
      return
    }
    
    const player: Player = {
      id: `player-${Date.now()}`,
      name: joinName || 'Mystery Player',
      score: 0,
    }
    const updatedRoom = {
      ...foundRoom,
      players: [...foundRoom.players, player],
      responses: { ...foundRoom.responses },
    }
    setRoom(updatedRoom)
    setSessionPlayerId(player.id)
    setError(null)
    saveRoomToStorage(updatedRoom)
    
    // Update URL with room param if available
    const roomParam = searchParams.get('room')
    if (roomParam) {
      setSearchParams({ room: roomParam })
    } else {
      setSearchParams({ code })
    }
  }

  const selectAnswer = (choiceIdx: number) => {
    if (!room || room.status !== 'question' || timeLeft <= 0 || !sessionPlayerId) return
    const updated = {
      ...room,
      responses: {
        ...room.responses,
        [sessionPlayerId]: { answerIndex: choiceIdx, remaining: timeLeft },
      },
    }
    setRoom(updated)
    updateRoomInStorage(updated)
  }

  const inLobby = room && room.status === 'lobby'
  const inQuestion = room && room.status === 'question'
  const inResults = room && (room.status === 'results' || room.status === 'final')

  const sessionPlayer = room?.players.find((p) => p.id === sessionPlayerId)
  const sortedLeaderboard = room
    ? [...room.players].sort((a, b) => b.score - a.score).slice(0, room.players.length)
    : []

  const playerResult = useMemo(() => {
    if (!sessionPlayerId || !room || !currentQuestion) return null
    const response = room.responses[sessionPlayerId]
    const wasCorrect = response?.answerIndex === currentQuestion.correctIndex
    const gain = room.lastGain[sessionPlayerId] ?? 0
    return { wasCorrect, gain }
  }, [sessionPlayerId, room, currentQuestion])

  // Poll for room updates
  useEffect(() => {
    if (!room) return
    const interval = setInterval(() => {
      const updated = getRoomFromStorage(room.code)
      if (updated) {
        setRoom(updated)
      }
    }, 1000)
    return () => clearInterval(interval)
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
        </header>

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
              <div className="mt-3 text-sm text-white/70">
                Found room: <span className="font-semibold">{room.code}</span> • Host {room.hostName}
              </div>
            )}
          </SectionCard>
        )}

        {room && (inLobby || sessionPlayerId) && (
          <SectionCard title="Lobby status" accent="from-primary/10 to-secondary/10">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-white/5 p-3 text-sm">
                <div className="text-white/60">Room</div>
                <div className="text-xl font-semibold tracking-[0.2em]">{room.code}</div>
              </div>
              <div className="rounded-lg bg-white/5 p-3 text-sm">
                <div className="text-white/60">Theme</div>
                <div className="text-lg font-semibold">{room.theme}</div>
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

        {room && inQuestion && currentQuestion && (
          <SectionCard title={`Question ${room.currentIndex + 1} / ${room.questions.length}`} accent="from-primary/30 to-secondary/30">
            <div className="grid gap-4 md:grid-cols-[2fr,1fr] md:items-start">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-primary/20 px-3 py-1 text-primary">{room.theme}</span>
                  <span className="rounded-full bg-white/10 px-3 py-1 capitalize text-white/80">
                    {room.difficulty}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-white/80">{room.timePerQuestion}s</span>
                </div>
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
                <div className="flex items-center justify-between rounded-lg bg-black/40 px-4 py-3">
                  <span className="text-4xl font-bold text-secondary">{timeLeft}s</span>
                  <div className="h-3 flex-1 rounded-full bg-white/10">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-secondary to-primary"
                      style={{ width: `${(timeLeft / room.timePerQuestion) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm text-white/70">
                  Points this round: <span className="font-semibold">{difficultyPoints[room.difficulty]}</span> + remaining seconds bonus
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
            <div className="grid gap-4 md:grid-cols-[2fr,1fr] md:items-start">
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
                        idx === 0
                          ? 'bg-gradient-to-r from-secondary/20 to-primary/20'
                          : 'bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-white/50">#{idx + 1}</span>
                        <span className="font-semibold">{p.name}</span>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-semibold">{p.score} pts</div>
                        {room.lastGain[p.id] !== undefined && (
                          <div className="text-secondary">+{room.lastGain[p.id]} this round</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        <footer className="pb-8 text-center text-xs text-white/40">
          © 2025 Built for fun — Why did the quiz break up with the answer? It couldn't find the right match! 🎯
        </footer>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/" element={<PlayerPage />} />
    </Routes>
  )
}
