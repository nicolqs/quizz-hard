import { NextRequest, NextResponse } from 'next/server'
import { chatCompletion, LlmCallError, LlmConfigError, resolveModel, sanitizeText } from '@/lib/openai'
import { checkRateLimit, rateLimitMessage } from '@/lib/ratelimit'

// A Heads Up! deck is just a list of guessable things. No choices, no correct
// answer: the room shouts clues and the guesser says the word out loud.

const MAX_WORDS = 60

function parseWords(raw: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new LlmCallError('OpenAI did not return valid JSON for the deck')
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { words?: unknown }).words)
      ? (parsed as { words: unknown[] }).words
      : []

  const seen = new Set<string>()
  const words: string[] = []

  for (const item of list) {
    const word = sanitizeText(item)
    // Anything long stops being clue-able in a few seconds, so drop it.
    if (!word || word.length > 40) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    words.push(word)
  }

  return words
}

export async function POST(request: NextRequest) {
  try {
    const { theme, count, aiModel } = await request.json()

    if (!theme || typeof theme !== 'string' || !theme.trim()) {
      return NextResponse.json({ error: 'Missing required field: theme' }, { status: 400 })
    }

    const limit = await checkRateLimit(request)
    if (!limit.ok) {
      return NextResponse.json(
        { error: rateLimitMessage(limit.scope), code: 'RATE_LIMITED' },
        { status: 429 },
      )
    }

    const wanted = Math.min(Math.max(Number(count) || 40, 10), MAX_WORDS)
    // Pinned to the offered list: aiModel arrives from an unauthenticated body.
    const model = resolveModel(aiModel)
    const seed = Math.random().toString(36).slice(2, 10)

    console.log('[Deck API] Generating', wanted, 'words about', theme, 'using', model)

    const content = await chatCompletion({
      model,
      maxTokens: 1200,
      temperature: 1.05,
      jsonMode: true,
      label: 'generating a Heads Up deck',
      messages: [
        {
          role: 'system',
          content:
            'You write word decks for Heads Up!, the party game where one player holds a phone to their forehead and everyone else shouts clues. Every entry must be a single well-known thing that a room of people can describe out loud in a few seconds without saying the word itself.',
        },
        {
          role: 'user',
          content: [
            `Theme: "${theme.trim()}".`,
            `Write ${wanted} entries for this theme.`,
            'Rules:',
            '- Each entry is 1 to 4 words, no punctuation, no numbering, no explanations.',
            '- Recognisable to most people at a party, not obscure trivia.',
            '- Concrete and clue-able: people, characters, objects, places, actions, films, foods.',
            '- No abstract concepts that are impossible to describe out loud.',
            '- No duplicates and no near-duplicates.',
            '- Mix easy and harder entries so the round has a rhythm.',
            `Random seed so repeat requests differ: ${seed}.`,
            'Respond with JSON only, in the form {"words": ["...", "..."]}.',
          ].join('\n'),
        },
      ],
    })

    const words = parseWords(content)

    if (words.length < 10) {
      throw new LlmCallError(`Deck came back too short (${words.length} usable words). Try a broader theme.`)
    }

    return NextResponse.json({ words: words.slice(0, wanted) })
  } catch (error) {
    if (error instanceof LlmConfigError) {
      console.error('[Deck API] Config error:', error.message)
      return NextResponse.json({ error: error.message, code: 'LLM_NOT_CONFIGURED' }, { status: 503 })
    }
    if (error instanceof LlmCallError) {
      console.error('[Deck API] LLM call error:', error.message)
      return NextResponse.json({ error: error.message, code: 'LLM_CALL_FAILED' }, { status: 502 })
    }
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Deck API] Unexpected error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
