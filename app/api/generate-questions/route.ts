import type { Difficulty, GameMode, Question } from '@/lib/types'
import {
  LlmCallError,
  LlmConfigError,
  samplingParams,
  sanitizeText,
  temperatureParam,
  tokenLimitParam,
} from '@/lib/openai'
import { NextRequest, NextResponse } from 'next/server'

// Diversity hints to push the model into a different corner of the theme each call.
const ANGLES = [
  'obscure trivia most fans miss',
  'recent developments from the last 5 years',
  'historical origins and firsts',
  'numbers, records, and statistics',
  'people and personalities behind the scenes',
  'cultural impact and references in other media',
  'inventions, breakthroughs, or turning points',
  'mistakes, controversies, and famous flops',
  'cross-cultural and international angles',
  'pop quiz curveballs that surprise experts',
  'unexpected connections between two topics',
  'symbols, mascots, or visual identity',
]
const ERAS = ['pre-1950', '1950s-1970s', '1980s', '1990s', '2000s', '2010s', '2020s', 'all-time mix']

// Strip any unknown / extra fields the LLM may emit (e.g. "explanation",
// "hint", "tip", "source") - we only keep the fields the game actually uses.
function sanitizeQuestion(q: Question): Question {
  return {
    question: sanitizeText(q.question),
    choices: Array.isArray(q.choices) ? q.choices.map((c) => sanitizeText(c)) : [],
    correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
  }
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function pickN<T>(items: T[], n: number): T[] {
  return shuffle(items).slice(0, n)
}

async function generateUniqueTheme(aiModel: string): Promise<string> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_KEY_HERE') {
    throw new LlmConfigError('OPENAI_API_KEY is not set on the server')
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: aiModel,
      messages: [
        {
          role: 'system',
          content: 'You create unique, creative, and fun trivia themes that players have never seen before.',
        },
        {
          role: 'user',
          content: `Generate ONE unique trivia theme that would be fun for a party quiz. Make it quirky, unexpected, and engaging. Random seed to vary your output: ${Math.random().toString(36).slice(2)}. Respond with ONLY the theme name, nothing else.`,
        },
      ],
      ...temperatureParam(aiModel, 1.1),
      ...tokenLimitParam(aiModel, 50),
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new LlmCallError(`OpenAI HTTP ${res.status} when generating theme: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  const generatedTheme = data?.choices?.[0]?.message?.content?.trim()
  if (!generatedTheme) {
    throw new LlmCallError('OpenAI returned empty theme content')
  }
  console.log('[Questions] Generated unique theme:', generatedTheme)
  return generatedTheme
}

async function fetchQuestionsFromOpenAI(
  theme: string,
  difficulty: Difficulty,
  count: number,
  aiModel: string,
  gameMode: GameMode = 'standard',
  playerNames?: string[],
  shouldGenerateTheme?: boolean,
  askedQuestions: string[] = [],
): Promise<{ questions: Question[]; generatedTheme?: string }> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_KEY_HERE') {
    throw new LlmConfigError('OPENAI_API_KEY is not set on the server. Add it to your env (Vercel project settings or .env.local) and restart.')
  }

  // Generate unique theme if needed (for custom mode with AI generation)
  let actualTheme = theme
  let generatedTheme: string | undefined
  if (gameMode === 'custom' && shouldGenerateTheme) {
    generatedTheme = await generateUniqueTheme(aiModel)
    actualTheme = generatedTheme
  }

  // Build a per-request "flavor pack" so two consecutive games on the same theme
  // diverge sharply instead of regurgitating the model's defaults.
  const angles = pickN(ANGLES, 3)
  const era = ERAS[Math.floor(Math.random() * ERAS.length)]
  const seed = Math.random().toString(36).slice(2, 10)

  // Show the model the last N questions we've already used in this room and tell it not to repeat them.
  const avoidList = askedQuestions.slice(-40)
  const avoidBlock = avoidList.length
    ? `\nAVOID these questions (already used in this room, do not repeat any of them, do not rephrase them): ${JSON.stringify(avoidList)}.`
    : ''

  let userPrompt: string

  // We use OpenAI JSON mode (response_format: json_object) to guarantee parseable
  // output. JSON mode requires the response to be an OBJECT, so we ask the model
  // to wrap the array in {"questions": [...]} and we unwrap it below.
  if (gameMode === 'emoji') {
    userPrompt = `Create ${count} ${difficulty} emoji decoder questions. Each question is a string of 2-5 emojis representing a famous movie, book, song, place, concept, or phrase. The 4 choices are text answers, one correct. Vary categories (movies, places, songs, books, concepts, phrases). Random seed: ${seed}. Lean into these angles: ${angles.join('; ')}.${avoidBlock}

Respond with a single JSON object: {"questions": [ {"question": string-of-emojis-only, "choices": [4 strings], "correctIndex": 0-3}, ... ]}`
  } else if (gameMode === 'personality') {
    const players = playerNames && playerNames.length > 0 ? playerNames : ['Player 1', 'Player 2', 'Player 3', 'Player 4']
    userPrompt = `Create ${count} playful "most likely to" / "who would win at this" / "who would survive this" party questions for these exact players: ${players.join(', ')}.

Rules:
- Each question is one sentence, light-hearted, group-safe (no insults, nothing mean, nothing about looks).
- Examples: "Who is most likely to start a podcast nobody asked for?", "Who would survive longest in a zombie apocalypse?", "Who is most likely to win a hot-dog eating contest?".
- The "choices" array MUST be exactly these player names in any order: ${JSON.stringify(players)}. Do not invent new names. Do not add filler choices.
- This is a popular-vote game: there is no correct answer. Do NOT include correctIndex.
- Make each question feel different - vary the vibe (chaotic, wholesome, competitive, absurd, cozy, dramatic).
- Random seed: ${seed}.${avoidBlock}

Respond with a single JSON object: {"questions": [ {"question": string, "choices": [${players.map(() => 'string').join(', ')}]}, ... ]}`
  } else {
    userPrompt = `Create ${count} ${difficulty} trivia questions about ${JSON.stringify(actualTheme)}.

Diversity rules (apply across the set so no two questions feel similar):
- Cover different sub-topics within the theme, not the same subject twice.
- Vary the angles: ${angles.join('; ')}.
- Bias the era/time period toward: ${era} (mix in others if it makes the set richer).
- Avoid the most stereotypical "first thing everyone asks" questions for this theme.
- Each correct answer should be a different fact - no two questions sharing the same answer.
- Spread correctIndex across 0/1/2/3 (do not put the right answer in the same slot every time).
- Random seed: ${seed}.${avoidBlock}

Respond with a single JSON object: {"questions": [ {"question": string, "choices": [4 strings], "correctIndex": 0-3}, ... ]}. Keep text concise. Properly escape any double quotes inside string values.`
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: aiModel,
      messages: [
        {
          role: 'system',
          content:
            'You generate lively multiple-choice trivia questions for a party game. You always respond with a single valid JSON object of the shape {"questions": [...]}. Each question object MUST have ONLY these three fields: "question" (string), "choices" (array of strings), "correctIndex" (integer). Do NOT include any other field - no "explanation", "hint", "tip", "source", "category", "difficulty", "notes", or anything else. Hard rules for every "question" and "choices" string: no newlines, no parenthetical asides about the model\'s own reasoning, no disclaimers, no notes like "(not exact)" or "(also see X)" or "(approximation)", no source citations, no emojis (unless this is emoji mode), no leading/trailing whitespace. Each question is a single self-contained sentence. Each choice is a short noun phrase. Never include markdown fences, never include commentary outside the JSON, and always escape inner double quotes with a backslash.',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      // JSON mode: model is forced to emit valid JSON.
      response_format: { type: 'json_object' },
      // Higher temperature + top_p to broaden the distribution between calls.
      ...temperatureParam(aiModel, 1.05),
      ...samplingParams(aiModel, { top_p: 0.95, presence_penalty: 0.6, frequency_penalty: 0.4 }),
      // Give the model enough room to finish the array without truncation.
      // Param name depends on model family: gpt-5.x/o-series want max_completion_tokens.
      ...tokenLimitParam(aiModel, 3000),
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new LlmCallError(`OpenAI HTTP ${res.status}: ${errText.slice(0, 300)}`)
  }

  const data = await res.json()
  let content = data?.choices?.[0]?.message?.content || ''
  const finishReason = data?.choices?.[0]?.finish_reason

  // Belt-and-suspenders: strip markdown fences if any model ignores JSON mode.
  content = content.trim()
  if (content.startsWith('```')) {
    const match = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (match) content = match[1].trim()
  }

  let parsed: Question[]
  try {
    const raw = JSON.parse(content)
    if (Array.isArray(raw)) {
      parsed = raw
    } else if (raw && Array.isArray(raw.questions)) {
      parsed = raw.questions
    } else if (raw && typeof raw === 'object') {
      const firstArray = Object.values(raw).find((v) => Array.isArray(v))
      if (!firstArray) throw new Error('JSON object had no array field')
      parsed = firstArray as Question[]
    } else {
      throw new Error('Top-level JSON was not an object or array')
    }
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
    console.error('[Questions] JSON parse failed.', { finishReason, msg, preview: content.slice(0, 400) })
    throw new LlmCallError(
      `LLM returned unparseable JSON${finishReason === 'length' ? ' (response was truncated - lower question count)' : ''}: ${msg}`,
    )
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new LlmCallError('LLM returned an empty question list')
  }

  // Scrub model self-commentary, stray newlines, and disclaimer parentheticals
  // out of every question and choice before anyone sees them.
  parsed = parsed.map(sanitizeQuestion)

  // Drop malformed questions: must have non-empty question text, at least 2
  // distinct non-empty choices, and a correctIndex within range.
  // (Personality mode requires len(choices) === len(playerNames), enforced below.)
  const expectedChoiceCount =
    gameMode === 'personality' && playerNames && playerNames.length >= 2
      ? playerNames.length
      : null
  parsed = parsed.filter((q) => {
    if (!q.question || typeof q.question !== 'string') return false
    if (!Array.isArray(q.choices) || q.choices.length < 2) return false
    if (!q.choices.every((c) => typeof c === 'string' && c.length > 0)) return false
    const uniqueChoices = new Set(q.choices.map((c) => c.trim().toLowerCase()))
    if (uniqueChoices.size < 2) return false // all duplicates -> not a real question
    if (
      typeof q.correctIndex !== 'number' ||
      q.correctIndex < 0 ||
      q.correctIndex >= q.choices.length
    ) {
      // Personality questions don't have a real correctIndex; popular vote sets it at scoring time.
      if (gameMode !== 'personality') return false
      q.correctIndex = 0
    }
    if (expectedChoiceCount !== null && q.choices.length !== expectedChoiceCount) return false
    return true
  })

  if (parsed.length === 0) {
    throw new LlmCallError('LLM returned questions but none had at least 2 valid distinct choices')
  }

  // De-duplicate against askedQuestions (case-insensitive).
  const seen = new Set(askedQuestions.map((q) => q.trim().toLowerCase()))
  const unique = parsed.filter((q) => {
    const key = q.question?.trim().toLowerCase()
    if (!key) return false
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const final = unique.length >= Math.max(1, Math.floor(count / 2)) ? unique : parsed

  // Personality mode: ensure correctIndex exists (placeholder - popular vote overrides at scoring time).
  if (gameMode === 'personality') {
    final.forEach((q) => {
      if (q.correctIndex === undefined || q.correctIndex === null) {
        q.correctIndex = 0
      }
    })
  }

  console.log('[Questions] Generated', final.length, 'questions from OpenAI (', aiModel, ')')
  return { questions: final.slice(0, count), generatedTheme }
}

export async function POST(request: NextRequest) {
  try {
    const { theme, difficulty, count, aiModel, playerNames, shouldGenerateTheme, gameMode, askedQuestions } =
      await request.json()

    // Validate input
    if (!theme || !difficulty || !count) {
      return NextResponse.json(
        { error: 'Missing required fields: theme, difficulty, count' },
        { status: 400 },
      )
    }

    if (count < 1 || count > 20) {
      return NextResponse.json({ error: 'Count must be between 1 and 20' }, { status: 400 })
    }

    const modelToUse = aiModel || 'gpt-5.6-luna'
    const mode: GameMode = gameMode || 'standard'

    console.log('[Questions API] Generating', count, difficulty, 'questions about', theme, 'using', modelToUse, 'mode:', mode, '| avoid:', (askedQuestions || []).length)

    const result = await fetchQuestionsFromOpenAI(
      theme,
      difficulty,
      count,
      modelToUse,
      mode,
      playerNames,
      shouldGenerateTheme,
      Array.isArray(askedQuestions) ? askedQuestions : [],
    )

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof LlmConfigError) {
      console.error('[Questions API] Config error:', error.message)
      return NextResponse.json({ error: error.message, code: 'LLM_NOT_CONFIGURED' }, { status: 503 })
    }
    if (error instanceof LlmCallError) {
      console.error('[Questions API] LLM call error:', error.message)
      return NextResponse.json({ error: error.message, code: 'LLM_CALL_FAILED' }, { status: 502 })
    }
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Questions API] Unexpected error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
