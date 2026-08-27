'use client'

import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ExternalGames } from '@/components/ExternalGames'
import { SectionCard } from '@/components/SectionCard'
import { ThemeToggle } from '@/components/ThemeToggle'
import { subscribeToRoom } from '@/lib/api'
import { fetchQuestionsFromChatGPT } from '@/lib/questions'
import { getRoomFromStorage, saveRoomToStorage } from '@/lib/storage'
import { aiModels, DEFAULT_AI_MODEL, difficultyPoints, emptyHeadsUpState, gameModes, ROUND_LENGTHS, themes, type Difficulty, type GameMode, type Player, type Room } from '@/lib/types'
import { decks, getDeck, shuffleWords } from '@/lib/decks'
import { advance as advanceShip, initialState as initialShip, MAX_HULL } from '@/lib/spaceteam'
import { postSpaceteamAction, postSpaceteamState } from '@/lib/api'
import { Panel } from '@/components/spaceteam/Panel'
import { SeaBattle } from '@/components/seabattle/SeaBattle'
import { InstructionCard, ShipStatus } from '@/components/spaceteam/Bridge'
import { advanceTurn, cardsFor, currentGuesserId, endTurn, guesserName, headsUpState, isLastTurn, mergeTurnResults, startTurn, turnClock } from '@/lib/headsup'
import { generatePlayerId, generateRoomCode } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export default function AdminPage() {
  const router = useRouter()
  const [room, setRoom] = useState<Room | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [sessionPlayerId, setSessionPlayerId] = useState<string | null>(null)
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [shareLink, setShareLink] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

  const [hostName, setHostName] = useState('Nico')
  const [gameMode, setGameMode] = useState<GameMode>('standard')
  const [theme, setTheme] = useState(themes[0])
  const [customTheme, setCustomTheme] = useState('')
  const [generateAITheme, setGenerateAITheme] = useState(false)
  const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL) // Fast & cheap default
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [questionCount, setQuestionCount] = useState(8)
  const [timePerQuestion, setTimePerQuestion] = useState(8)
  const [deckId, setDeckId] = useState<string>(decks[0].id)
  const [deckTheme, setDeckTheme] = useState('')
  const [roundSeconds, setRoundSeconds] = useState<number>(60)

  const currentQuestion = useMemo(
    () => (room && room.questions[room.currentIndex]) || null,
    [room],
  )

  useEffect(() => {
    if (room?.status === 'question' && room.gameMode !== 'headsup') {
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
  }, [room?.status, room?.currentIndex, room?.timePerQuestion, room?.gameMode])

  // Heads Up runs off the shared turnStartedAt rather than a local countdown, so
  // the host, the guesser and the clue-givers all see the same number.
  const hu = headsUpState(room)
  const ship = room?.gameMode === 'spaceteam' ? room.spaceteam ?? null : null
  const roomRef = useRef<Room | null>(null)
  roomRef.current = room
  /** Highest action already scored, so a re-delivered room cannot double-count. */
  const processedSeq = useRef(0)

  // The host device is the only one that advances the ship: it drains the
  // actions everyone posted, expires overdue instructions and hands out new ones.
  useEffect(() => {
    if (!room || room.gameMode !== 'spaceteam' || room.status !== 'question') return

    const timer = setInterval(() => {
      const current = roomRef.current
      const state = current?.spaceteam
      if (!current || !state || state.outcome !== 'flying') return

      const fresh = state.pending.filter((action) => action.seq > processedSeq.current)
      const through = state.pending.reduce((max, action) => Math.max(max, action.seq), 0)
      const names = Object.fromEntries(current.players.map((p) => [p.id, p.name]))
      const { state: next, changed } = advanceShip({ ...state, pending: fresh }, Date.now(), names)
      if (!changed) return

      processedSeq.current = Math.max(processedSeq.current, through)
      setRoom((prev) => (prev ? { ...prev, spaceteam: next } : prev))
      void postSpaceteamState(current.code, next, through)

      if (next.outcome !== 'flying') {
        const finished: Room = { ...current, spaceteam: next, status: 'final' }
        saveRoomToStorage(finished).catch(console.error)
        setRoom(finished)
      }
    }, 400)

    return () => clearInterval(timer)
  }, [room?.gameMode, room?.status])

  useEffect(() => {
    if (!room || room.gameMode !== 'headsup' || room.status !== 'question') return
    const tick = () => {
      const { countdown, timeLeft: left, expired } = turnClock(room.headsUp ?? null)
      setTimeLeft(countdown > 0 ? room.headsUp?.roundSeconds ?? 0 : left)
      if (expired) void finishHeadsUpTurn()
    }
    tick()
    const ticker = setInterval(tick, 250)
    return () => clearInterval(ticker)
  }, [room?.status, room?.gameMode, room?.headsUp?.turnStartedAt, room?.headsUp?.turnIndex])

  const createRoom = async () => {
    const code = generateRoomCode()
    const player: Player = {
      id: generatePlayerId('host'),
      name: hostName || 'Host',
      score: 0,
    }
    
    // Determine theme based on game mode
    let finalTheme = theme
    if (gameMode === 'custom') {
      finalTheme = customTheme || 'Custom Trivia'
    } else if (gameMode === 'emoji') {
      finalTheme = 'Emoji Decoder'
    } else if (gameMode === 'personality') {
      finalTheme = 'Personality Mode'
    } else if (gameMode === 'headsup') {
      finalTheme = deckId === 'ai' ? deckTheme || 'Heads Up!' : getDeck(deckId)?.name || 'Heads Up!'
    }

    const newRoom: Room = {
      code,
      hostName: hostName || 'Host',
      gameMode,
      theme: finalTheme,
      aiModel,
      difficulty,
      questionCount,
      timePerQuestion,
      players: [player],
      questions: [],
      currentIndex: 0,
      status: 'lobby',
      responses: {},
      lastGain: {},
      headsUp:
        gameMode === 'headsup'
          ? {
              ...emptyHeadsUpState(),
              deckId,
              deckName: finalTheme,
              roundSeconds,
            }
          : undefined,
    }
    await saveRoomToStorage(newRoom)
    setRoom(newRoom)
    setSessionPlayerId(player.id)
    
    // Generate simple share link with just room code
    const link = `${window.location.origin}/?code=${code}`
    setShareLink(link)
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  /** Heads Up start: load the deck, then put the first player on the clock. */
  const startHeadsUp = async () => {
    if (!room) return
    setGenerationError(null)

    const order = room.players.map((p) => p.id)
    if (!order.length) return

    let words: string[] = []
    const useAi = (room.headsUp?.deckId || deckId) === 'ai'

    if (useAi) {
      const generatingRoom: Room = { ...room, status: 'generating' }
      await saveRoomToStorage(generatingRoom)
      setRoom(generatingRoom)
      setLoadingQuestions(true)
      try {
        const res = await fetch('/api/generate-deck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: room.theme, count: 45, aiModel: room.aiModel }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || `Deck request failed (${res.status})`)
        words = Array.isArray(data.words) ? data.words : []
        if (words.length < 10) throw new Error('The deck came back too short. Try another theme.')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setGenerationError(msg)
        const recovered: Room = { ...generatingRoom, status: 'lobby' }
        await saveRoomToStorage(recovered)
        setRoom(recovered)
        setLoadingQuestions(false)
        return
      }
      setLoadingQuestions(false)
    } else {
      const deck = getDeck(room.headsUp?.deckId || deckId)
      words = shuffleWords(deck?.words ?? [])
    }

    const prepared: Room = {
      ...room,
      round: (room.round ?? 0) + 1,
      headsUp: {
        ...(room.headsUp ?? emptyHeadsUpState()),
        deckId: room.headsUp?.deckId || deckId,
        deckName: room.theme,
        roundSeconds: room.headsUp?.roundSeconds || roundSeconds,
        words,
        order,
        turnIndex: 0,
        cardIndex: 0,
        results: {},
      },
    }

    const live = startTurn(prepared, 0)
    await saveRoomToStorage(live)
    setRoom(live)
  }

  /**
   * Ends the live turn against the freshest copy of the room, so cards the
   * guesser tapped in the last moments still count.
   */
  const finishHeadsUpTurn = useCallback(async () => {
    const current = roomRef.current
    if (!current || current.gameMode !== 'headsup' || current.status !== 'question') return
    const latest = await getRoomFromStorage(current.code).catch(() => null)
    const merged = latest ? mergeTurnResults(current, latest) : current
    const ended = endTurn(merged)
    await saveRoomToStorage(ended)
    setRoom(ended)
  }, [])

  const nextHeadsUpTurn = async () => {
    if (!room) return
    const updated = advanceTurn(room)
    await saveRoomToStorage(updated)
    setRoom(updated)
  }

  /** Spaceteam: build the ship, then let the host tick drive it. */
  const startSpaceteam = async () => {
    if (!room || !room.players.length) return
    const seed = Math.floor(Math.random() * 1e9)
    const ship = initialShip(room.players.map((p) => p.id), seed, Date.now())

    const launched: Room = { ...room, status: 'question', round: (room.round ?? 0) + 1, spaceteam: ship }
    await saveRoomToStorage(launched)
    // The room upsert deliberately leaves the spaceteam column alone, so the
    // opening state goes through the dedicated endpoint like every later tick.
    await postSpaceteamState(room.code, ship, 0)
    setRoom(launched)
    processedSeq.current = 0
  }

  /** Sea Battle: the server owns the fleets, so it also opens the game. */
  const startSeaBattle = async () => {
    if (!room) return
    if (room.players.length < 2) {
      setGenerationError('Sea Battle is a duel: you need a second player in the room.')
      return
    }
    setGenerationError(null)
    const res = await fetch(`/api/rooms/${room.code}/sea-battle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'start', playerIds: room.players.map((p) => p.id) }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setGenerationError(data?.error ?? 'Could not start the battle')
      return
    }
    const launched: Room = { ...room, status: 'question', seaBattle: data.state }
    await saveRoomToStorage(launched)
    setRoom(launched)
  }

  const startGame = async () => {
    if (!room) return
    if (room.gameMode === 'headsup') return startHeadsUp()
    if (room.gameMode === 'spaceteam') return startSpaceteam()
    if (room.gameMode === 'seabattle') return startSeaBattle()

    setGenerationError(null)

    // Set status to 'generating' so players see the loading state
    const generatingRoom: Room = {
      ...room,
      status: 'generating',
      round: (room.round ?? 0) + 1,
    }
    await saveRoomToStorage(generatingRoom)
    setRoom(generatingRoom)
    setLoadingQuestions(true)

    // Fetch questions from AI
    const playerNames = room.gameMode === 'personality' ? room.players.map(p => p.name) : undefined
    const shouldGenerateTheme = room.gameMode === 'custom' && generateAITheme

    try {
      const result = await fetchQuestionsFromChatGPT(
        room.theme,
        room.difficulty,
        room.questionCount,
        room.aiModel,
        playerNames,
        shouldGenerateTheme,
        room.gameMode,
        room.askedQuestions || [],
      )

      // Track the questions we've now used so the next round won't repeat them.
      const newQuestionTexts = result.questions.map((q) => q.question).filter(Boolean)
      const nextAsked = [...(room.askedQuestions || []), ...newQuestionTexts].slice(-200)

      const updatedRoom: Room = {
        ...generatingRoom,
        questions: result.questions,
        generatedTheme: result.generatedTheme,
        askedQuestions: nextAsked,
        currentIndex: 0,
        status: 'question',
        responses: {},
        lastGain: {},
      }
      await saveRoomToStorage(updatedRoom)
      setRoom(updatedRoom)
    } catch (err) {
      // No fallback. Surface the error and put the room back to lobby so the host can retry.
      const msg = err instanceof Error ? err.message : String(err)
      setGenerationError(msg)
      const recoveredRoom: Room = { ...generatingRoom, status: 'lobby' }
      await saveRoomToStorage(recoveredRoom)
      setRoom(recoveredRoom)
    } finally {
      setLoadingQuestions(false)
    }
  }

  const endQuestion = useCallback(async () => {
    setRoom((prev) => {
      if (!prev || prev.status !== 'question' || !prev.questions.length) return prev
      const q = prev.questions[prev.currentIndex]
      if (!q) return prev

      // Personality mode = popular vote. The "correct" answer is whichever choice
      // got the most votes this round; ties are broken by lowest index for stability.
      let effectiveCorrectIndex = q.correctIndex
      const questionToPersist: typeof q = { ...q }
      if (prev.gameMode === 'personality') {
        const tally: number[] = new Array(q.choices.length).fill(0)
        Object.values(prev.responses).forEach((r) => {
          if (typeof r.answerIndex === 'number' && r.answerIndex >= 0 && r.answerIndex < tally.length) {
            tally[r.answerIndex] += 1
          }
        })
        let topIdx = 0
        let topVotes = -1
        tally.forEach((votes, idx) => {
          if (votes > topVotes) {
            topVotes = votes
            topIdx = idx
          }
        })
        effectiveCorrectIndex = topVotes > 0 ? topIdx : -1 // -1 = nobody voted, nobody scores
        questionToPersist.correctIndex = effectiveCorrectIndex >= 0 ? effectiveCorrectIndex : 0
      }

      const lastGain: Record<string, number> = {}
      const players = prev.players.map((p) => {
        const response = prev.responses[p.id]
        const correct = effectiveCorrectIndex >= 0 && response?.answerIndex === effectiveCorrectIndex
        const gain = correct
          ? difficultyPoints[prev.difficulty] + Math.max(0, Math.round(response.remaining))
          : 0
        lastGain[p.id] = gain
        return { ...p, score: p.score + gain }
      })

      // For personality mode, persist the winning choice into the question so the
      // results screen shows the popular vote winner instead of a placeholder.
      const questions =
        prev.gameMode === 'personality'
          ? prev.questions.map((qq, i) => (i === prev.currentIndex ? questionToPersist : qq))
          : prev.questions

      const finished = prev.currentIndex >= prev.questions.length - 1
      const updated: Room = {
        ...prev,
        questions,
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

  // Reset the room back to its lobby state while keeping the same room code (and players).
  // This is the "play again with the same code" path - askedQuestions is preserved so the
  // next round avoids repeating questions from earlier rounds.
  const restartRoom = (resetPoints: boolean) => {
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

  // Apply the menu's settings (mode, theme, difficulty, count, etc.) to the
  // CURRENT room, keeping the same code + players + scores + askedQuestions.
  // Forces the room back to lobby so the host can hit Start Game with the new
  // config. Used when the host wants to switch game mode mid-session without
  // making everyone rejoin.
  const applySettingsToCurrentRoom = () => {
    if (!room) return

    // Resolve the displayed theme from the selected mode (same logic as createRoom).
    let finalTheme = theme
    if (gameMode === 'custom') {
      finalTheme = customTheme || 'Custom Trivia'
    } else if (gameMode === 'emoji') {
      finalTheme = 'Emoji Decoder'
    } else if (gameMode === 'personality') {
      finalTheme = 'Personality Mode'
    }

    const updated: Room = {
      ...room,
      hostName: hostName || room.hostName,
      gameMode,
      theme: finalTheme,
      generatedTheme: undefined, // forced re-gen if custom + AI surprise
      aiModel,
      difficulty,
      questionCount,
      timePerQuestion,
      // Reset round state - new mode means new questions; keep askedQuestions
      // so the new round still avoids any prior overlap.
      currentIndex: 0,
      questions: [],
      status: 'lobby',
      responses: {},
      lastGain: {},
    }
    setRoom(updated)
    saveRoomToStorage(updated).catch(console.error)
    setTimeLeft(0)
    setMenuOpen(false)
  }

  const copyShareLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }


  const headsUpSettings = (
    <div className="space-y-3">
      <div>
        <label className="text-sm text-slate-300">Deck</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {decks.map((deck) => (
            <button
              key={deck.id}
              onClick={() => setDeckId(deck.id)}
              className={`rounded-lg border p-2 text-left transition ${
                deckId === deck.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-white/10 bg-white/5 hover:border-primary/40'
              }`}
            >
              <div className="text-sm font-semibold">
                {deck.emoji} {deck.name}
              </div>
              <div className="text-[11px] text-white/50">{deck.words.length} cards</div>
            </button>
          ))}
          <button
            onClick={() => setDeckId('ai')}
            className={`col-span-2 rounded-lg border p-2 text-left transition ${
              deckId === 'ai'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-white/10 bg-white/5 hover:border-primary/40'
            }`}
          >
            <div className="text-sm font-semibold">✨ Any theme (AI)</div>
            <div className="text-[11px] text-white/50">Type a theme and the AI writes the deck</div>
          </button>
        </div>
      </div>

      {deckId === 'ai' && (
        <div>
          <label className="text-sm text-slate-300">Deck theme</label>
          <input
            type="text"
            value={deckTheme}
            onChange={(e) => setDeckTheme(e.target.value)}
            placeholder="e.g. '90s cartoons' or 'things in this office'"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          />
        </div>
      )}

      <div>
        <label className="text-sm text-slate-300">Round length</label>
        <div className="mt-1 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
          {ROUND_LENGTHS.map((secs) => (
            <button
              key={secs}
              onClick={() => setRoundSeconds(secs)}
              className={`rounded-lg px-2 py-2 transition ${
                roundSeconds === secs
                  ? 'bg-primary text-white shadow'
                  : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              {secs}s
            </button>
          ))}
        </div>
      </div>

      <p className="rounded-lg bg-white/5 p-3 text-xs text-white/60">
        Each player takes a turn holding their phone to their forehead. Everyone else shouts clues.
        Tilt down for correct, up to pass. On a laptop, or over plain http, tap the screen instead.
      </p>
    </div>
  )

  const inLobby = room && room.status === 'lobby'
  const inGenerating = room && room.status === 'generating'
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
    <div className="min-h-screen">
      {/* Hamburger Menu Overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <div className="relative z-10 w-full max-w-md overflow-y-auto bg-slate-900/95 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Room Setup</h2>
              <button
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="grid gap-4">
              <div>
                <label className="text-sm text-slate-300">Your name</label>
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Admin name"
                />
              </div>

              <div>
                <label className="text-sm text-slate-300 font-semibold">Game Mode</label>
                <div className="mt-2 grid gap-2">
                  {gameModes.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setGameMode(mode.id as GameMode)}
                      className={`rounded-lg border p-3 text-left transition ${
                        gameMode === mode.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-white/10 bg-white/5 hover:border-primary/40'
                      }`}
                    >
                      <div className="font-semibold">{mode.name}</div>
                      <div className="text-xs text-white/60">{mode.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {gameMode === 'standard' && (
                <div>
                  <label className="text-sm text-slate-300">Theme</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                  >
                    {themes.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}

              {gameMode === 'custom' && (
                <div>
                  <label className="text-sm text-slate-300">Custom Theme</label>
                  <input
                    type="text"
                    value={customTheme}
                    onChange={(e) => setCustomTheme(e.target.value)}
                    placeholder="e.g., 'Trivia from the year 2000'"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                  />
                  <label className="mt-2 flex items-center gap-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={generateAITheme}
                      onChange={(e) => setGenerateAITheme(e.target.checked)}
                      className="rounded border-white/10"
                    />
                    Let AI generate a surprise theme
                  </label>
                </div>
              )}

              {gameMode === 'headsup' && headsUpSettings}

              <div>
                <label className="text-sm text-slate-300">AI Model</label>
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-base sm:text-sm"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                >
                  {aiModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} - {model.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-300">Difficulty</label>
                <div className="mt-1 grid grid-cols-4 gap-2 text-center text-xs font-semibold">
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-300">Questions</label>
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
                  <label className="text-sm text-slate-300">Time (s)</label>
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

              {room && (
                <div className="rounded-lg border border-secondary/30 bg-secondary/10 p-4">
                  <p className="text-sm text-secondary">Room already created: <span className="font-bold">{room.code}</span></p>
                  <p className="mt-1 text-xs text-secondary/70">Apply settings below to keep the same code + players. Use "Create New Room" only to start fresh.</p>
                </div>
              )}

              {room && (
                <button
                  onClick={applySettingsToCurrentRoom}
                  className="mt-2 w-full rounded-xl bg-primary px-4 py-3 text-lg font-semibold text-white shadow-lg transition hover:scale-[1.01]"
                >
                  Apply settings to {room.code}
                </button>
              )}

              {room && (
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to create a new room? The current room will be replaced.')) {
                      setRoom(null)
                      setSessionPlayerId(null)
                      setShareLink('')
                      setMenuOpen(false)
                    }
                  }}
                  className="mt-2 w-full rounded-xl border-2 border-danger/50 bg-danger/10 px-4 py-3 text-lg font-semibold text-danger transition hover:bg-danger/20"
                >
                  Create New Room
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <p className="text-xs uppercase tracking-[0.4em] text-primary/80">Party Quiz</p>
            <h1 className="text-3xl font-bold sm:text-4xl">Nix Games</h1>
            {/* <p className="text-sm text-slate-300">Jackbox-style room play with AI-authored trivia.</p> */}
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setMenuOpen(true)}
              className="rounded-lg p-2 hover:bg-white/10"
              title="Room Settings"
            >
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </header>

        {generationError && (
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-200">
            <div className="font-semibold">❌ Couldn&apos;t generate questions</div>
            <div className="mt-1 text-red-100/90 break-words">{generationError}</div>
            <div className="mt-2 text-xs text-red-100/70">
              Every game calls the LLM - there is no preset fallback. Common fixes:
              <ul className="mt-1 list-disc pl-5">
                <li>Set <code className="rounded bg-black/40 px-1 py-0.5">OPENAI_API_KEY</code> in your server env and restart</li>
                <li>Pick a different model in the menu (this model may not exist on your account)</li>
                <li>Lower the question count if the LLM truncated its response</li>
              </ul>
            </div>
            <button
              onClick={() => setGenerationError(null)}
              className="mt-2 rounded bg-red-500/20 px-2 py-1 text-xs text-red-100 hover:bg-red-500/30"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Initial Room Creation */}
        {!room && (
          <SectionCard title="Host setup">
            <div className="grid gap-3">
              <label className="text-sm text-slate-300">Your name</label>
              <input
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="Admin name"
              />

              <label className="text-sm text-slate-300 font-semibold">Game Mode</label>
              <div className="grid gap-2">
                {gameModes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setGameMode(mode.id as GameMode)}
                    className={`rounded-lg border p-3 text-left transition ${
                      gameMode === mode.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-white/10 bg-white/5 hover:border-primary/40'
                    }`}
                  >
                    <div className="font-semibold">{mode.name}</div>
                    <div className="text-xs text-white/60">{mode.description}</div>
                  </button>
                ))}
              </div>

              {gameMode === 'standard' && (
                <>
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
                </>
              )}

              {gameMode === 'custom' && (
                <>
                  <label className="text-sm text-slate-300">Custom Theme</label>
                  <input
                    type="text"
                    value={customTheme}
                    onChange={(e) => setCustomTheme(e.target.value)}
                    placeholder="e.g., 'Trivia from the year 2000'"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                  />
                  <label className="flex items-center gap-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={generateAITheme}
                      onChange={(e) => setGenerateAITheme(e.target.checked)}
                      className="rounded border-white/10"
                    />
                    Let AI generate a surprise theme
                  </label>
                </>
              )}

              {gameMode === 'headsup' && headsUpSettings}

              <label className="text-sm text-slate-300">AI Model</label>
              <select
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-base sm:text-sm"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
              >
                {aiModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} - {model.description}
                  </option>
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
              >
                Generate Room
              </button>
            </div>
          </SectionCard>
        )}

        {!room && <ExternalGames />}

        {/* Lobby View - After Room Created */}
        {room && inLobby && (
          <div className="grid gap-4 lg:grid-cols-2">
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
                  {loadingQuestions
                    ? room.gameMode === 'headsup'
                      ? 'Writing the deck…'
                      : 'Summoning AI questions…'
                    : room.gameMode === 'headsup'
                      ? `Start Heads Up (${room.players.length} ${room.players.length === 1 ? 'turn' : 'turns'})`
                      : room.gameMode === 'spaceteam'
                        ? `Launch (${room.players.length} aboard)`
                        : room.gameMode === 'seabattle'
                          ? 'Start the battle'
                          : 'Start Game'}
                </button>
              </div>
            </SectionCard>

            <SectionCard title="Share with players" accent="from-primary/20 to-secondary/30">
              <p className="text-sm text-white/70">Share this link with players to join automatically.</p>
              <div className="mt-3 grid gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <input
                    readOnly
                    value={shareLink}
                    className="flex-1 bg-transparent text-base sm:text-sm font-mono text-white/80 outline-none"
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
          </div>
        )}

        {/* Generating Questions View */}
        {room && inGenerating && (
          <SectionCard title="🤖 AI Working..." accent="from-primary/30 to-secondary/30">
            <LoadingSpinner 
              message="Summoning AI questions…"
              subMessage={`Generating ${room.questionCount} ${room.difficulty} questions about ${room.generatedTheme || room.theme}`}
            />
            <div className="mt-4 text-center">
              <p className="text-sm text-white/60 light:text-black/60">⏱️ Takes about ~10 seconds</p>
              <p className="text-xs text-white/50 light:text-black/50 mt-1">Your players see this too!</p>
            </div>
          </SectionCard>
        )}

        {/* Sea Battle: the host takes one of the two seats. */}
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

        {/* Spaceteam: the host has a panel like everyone else. */}
        {room && room.gameMode === 'spaceteam' && ship && (inQuestion || room.status === 'final') && (
          <div className="grid gap-3">
            {ship.outcome === 'flying' ? (
              <>
                <InstructionCard instruction={ship.instructions[sessionPlayerId || ''] ?? null} />
                <ShipStatus state={ship} />
                <Panel
                  controls={ship.panels[sessionPlayerId || ''] ?? []}
                  onAction={(controlId, value) =>
                    sessionPlayerId &&
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
                title={ship.outcome === 'won' ? '🎉 You made it' : '💥 The ship is gone'}
                accent="from-primary/30 to-secondary/30"
              >
                <p className="text-center text-lg">
                  {ship.outcome === 'won'
                    ? `Cleared all ${ship.level} levels with ${Math.round((ship.hull / MAX_HULL) * 100)}% hull left.`
                    : `Broke apart on level ${ship.level} after ${ship.completed} instructions.`}
                </p>
                <button
                  onClick={startSpaceteam}
                  className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-lg font-semibold text-white"
                >
                  Fly again
                </button>
              </SectionCard>
            )}
          </div>
        )}

        {/* Heads Up: live turn. The host screen is the room's shared view, so it
            shows the word to everyone EXCEPT when the host is the one guessing. */}
        {room && room.gameMode === 'headsup' && inQuestion && hu && (
          <SectionCard
            title={`${guesserName(room)} is up · turn ${hu.turnIndex + 1} / ${hu.order.length}`}
            accent="from-primary/30 to-secondary/30"
          >
            {currentGuesserId(room) === sessionPlayerId ? (
              <div className="py-8 text-center">
                <p className="text-2xl font-bold">You are guessing.</p>
                <p className="mt-2 text-white/60">Pick up your phone, hold it to your forehead, and do not look at this screen.</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm uppercase tracking-[0.3em] text-white/60">Shout clues for</p>
                <p className="mt-3 text-5xl font-black leading-tight sm:text-7xl">
                  {hu.words[hu.cardIndex + cardsFor(hu, currentGuesserId(room) || '').length] ?? '…'}
                </p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-4">
              <span className="text-sm text-white/60">
                {cardsFor(hu, currentGuesserId(room) || '').filter((c) => c.got).length} correct
              </span>
              <span className={`rounded-lg px-4 py-2 text-3xl font-bold ${timeLeft <= 10 ? 'text-danger' : 'text-secondary'}`}>
                {timeLeft}s
              </span>
              <button
                onClick={() => void finishHeadsUpTurn()}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
              >
                End turn
              </button>
            </div>
          </SectionCard>
        )}

        {/* Heads Up: turn summary */}
        {room && room.gameMode === 'headsup' && room.status === 'results' && hu && (
          <SectionCard title={`${guesserName(room)} scored ${room.lastGain[currentGuesserId(room) || ''] ?? 0}`} accent="from-secondary/20 to-primary/20">
            <div className="grid gap-2 sm:grid-cols-2">
              {cardsFor(hu, currentGuesserId(room) || '').map((card, idx) => (
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
              {cardsFor(hu, currentGuesserId(room) || '').length === 0 && (
                <p className="text-sm text-white/60">No cards played.</p>
              )}
            </div>

            <button
              onClick={nextHeadsUpTurn}
              className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-lg font-semibold text-white shadow-lg transition hover:scale-[1.01]"
            >
              {isLastTurn(room)
                ? 'Finish and show the leaderboard'
                : `Next up: ${room.players.find((p) => p.id === hu.order[hu.turnIndex + 1])?.name || 'next player'}`}
            </button>
          </SectionCard>
        )}

        {/* Heads Up: final leaderboard */}
        {room && room.gameMode === 'headsup' && room.status === 'final' && hu && (
          <SectionCard title="Final leaderboard" accent="from-secondary/30 to-primary/30">
            <div className="grid gap-2">
              {sortedLeaderboard.map((p, idx) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                    idx === 0 ? 'bg-gradient-to-r from-secondary/25 to-primary/25' : 'bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-white/50">#{idx + 1}</span>
                    <span className="font-semibold">{p.name}</span>
                  </div>
                  <span className="font-bold">{p.score}</span>
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                const reset: Room = {
                  ...room,
                  status: 'lobby',
                  players: room.players.map((p) => ({ ...p, score: 0 })),
                  lastGain: {},
                  headsUp: {
                    ...hu,
                    words: [],
                    order: [],
                    turnIndex: 0,
                    cardIndex: 0,
                    results: {},
                    turnStartedAt: undefined,
                  },
                }
                await saveRoomToStorage(reset)
                setRoom(reset)
              }}
              className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-lg font-semibold text-white shadow-lg transition hover:scale-[1.01]"
            >
              New game, same room
            </button>
          </SectionCard>
        )}

        {/* Question View - Gameplay at Top */}
        {room && inQuestion && currentQuestion && (
          <>
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

            {/* Live Leaderboard at Bottom During Questions */}
            <SectionCard title="Live standings" accent="from-secondary/20 to-primary/20">
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {sortedLeaderboard.map((p, idx) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded-xl border border-white/5 px-4 py-2 ${
                      idx === 0 ? 'bg-gradient-to-r from-secondary/20 to-primary/20' : 'bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50">#{idx + 1}</span>
                      <span className="font-semibold text-sm">{p.name}</span>
                    </div>
                    <div className="text-sm font-semibold">{p.score} pts</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </>
        )}

        {/* Results View */}
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
                    <div className="rounded-lg border border-secondary/30 bg-secondary/10 p-3 text-center text-sm text-secondary">
                      Same room code <span className="font-bold tracking-[0.2em]">{room.code}</span> - players stay connected, no need to rejoin.
                    </div>
                    <button
                      onClick={() => restartRoom(false)}
                      className="w-full rounded-xl bg-secondary px-4 py-3 text-lg font-semibold text-slate-900 shadow-lg transition hover:scale-[1.01]"
                    >
                      Play again (keep scores)
                    </button>
                    <button
                      onClick={() => restartRoom(true)}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-lg font-semibold text-white shadow-lg transition hover:scale-[1.01]"
                    >
                      Play again (reset scores)
                    </button>
                  </div>
                )}
              </div>
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

