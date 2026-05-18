import type { Difficulty, GameMode, GenerateQuestionsResponse } from './types'

export class GenerateQuestionsError extends Error {
  code?: string
  status?: number
  constructor(message: string, opts?: { code?: string; status?: number }) {
    super(message)
    this.code = opts?.code
    this.status = opts?.status
  }
}

// Client-side function to fetch questions from API.
// Throws GenerateQuestionsError on any failure - there is no static fallback.
export async function fetchQuestionsFromChatGPT(
  theme: string,
  difficulty: Difficulty,
  count: number,
  aiModel: string,
  playerNames?: string[],
  shouldGenerateTheme?: boolean,
  gameMode?: GameMode,
  askedQuestions?: string[],
): Promise<GenerateQuestionsResponse> {
  console.log('[Questions] Requesting', count, difficulty, 'questions about', theme, 'using', aiModel, 'mode:', gameMode, '| avoid:', (askedQuestions || []).length)

  const response = await fetch('/api/generate-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      theme,
      difficulty,
      count,
      aiModel,
      playerNames,
      shouldGenerateTheme,
      gameMode,
      askedQuestions: askedQuestions || [],
    }),
  })

  if (!response.ok) {
    let body: { error?: string; code?: string } = {}
    try {
      body = await response.json()
    } catch {
      /* non-JSON error body */
    }
    const msg = body.error || `Failed to generate questions (HTTP ${response.status})`
    console.error('[Questions] API error:', msg)
    throw new GenerateQuestionsError(msg, { code: body.code, status: response.status })
  }

  const data = (await response.json()) as GenerateQuestionsResponse
  console.log('[Questions] Received', data.questions.length, 'questions')
  if (data.generatedTheme) {
    console.log('[Questions] Generated theme:', data.generatedTheme)
  }
  return data
}
