import type { Difficulty, GameMode, GenerateQuestionsResponse } from './types'

// Client-side function to fetch questions from API
export async function fetchQuestionsFromChatGPT(
  theme: string,
  difficulty: Difficulty,
  count: number,
  aiModel: string,
  playerNames?: string[],
  shouldGenerateTheme?: boolean,
  gameMode?: GameMode,
): Promise<GenerateQuestionsResponse> {
  try {
    console.log('[Questions] Requesting', count, difficulty, 'questions about', theme, 'using', aiModel, 'mode:', gameMode)
    
    const response = await fetch('/api/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme, difficulty, count, aiModel, playerNames, shouldGenerateTheme, gameMode }),
    })

    if (!response.ok) {
      throw new Error('Failed to generate questions')
    }

    const data = await response.json()
    console.log('[Questions] Received', data.questions.length, 'questions')
    if (data.generatedTheme) {
      console.log('[Questions] Generated theme:', data.generatedTheme)
    }
    return data
  } catch (err) {
    console.error('[Questions] Error fetching questions:', err)
    // Return empty array on error - caller should handle this
    throw err
  }
}
