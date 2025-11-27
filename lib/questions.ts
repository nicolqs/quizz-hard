import type { Difficulty, Question } from './types'

// Client-side function to fetch questions from API
export async function fetchQuestionsFromChatGPT(
  theme: string,
  difficulty: Difficulty,
  count: number,
): Promise<Question[]> {
  try {
    console.log('[Questions] Requesting', count, difficulty, 'questions about', theme)
    
    const response = await fetch('/api/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme, difficulty, count }),
    })

    if (!response.ok) {
      throw new Error('Failed to generate questions')
    }

    const data = await response.json()
    console.log('[Questions] Received', data.questions.length, 'questions')
    return data.questions
  } catch (err) {
    console.error('[Questions] Error fetching questions:', err)
    // Return empty array on error - caller should handle this
    throw err
  }
}
