import type { Difficulty, Question } from '@/lib/types'
import { NextRequest, NextResponse } from 'next/server'

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

async function fetchQuestionsFromOpenAI(
  theme: string,
  difficulty: Difficulty,
  count: number,
): Promise<Question[]> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
  
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_KEY_HERE') {
    console.log('[Questions] No OpenAI key, using fallback questions')
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
    let content = data?.choices?.[0]?.message?.content || '[]'
    
    // Remove markdown code blocks if present (```json ... ```)
    content = content.trim()
    if (content.startsWith('```')) {
      // Extract content between code blocks
      const match = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      if (match) {
        content = match[1].trim()
      }
    }
    
    const parsed: Question[] = JSON.parse(content)
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Bad format')
    console.log('[Questions] Generated', parsed.length, 'questions from OpenAI')
    return parsed.slice(0, count)
  } catch (err) {
    console.error('[Questions] OpenAI fetch failed, using fallback:', err)
    return Array.from({ length: count }, (_, i) =>
      fallbackBank[(i + 1) % fallbackBank.length],
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { theme, difficulty, count } = await request.json()

    // Validate input
    if (!theme || !difficulty || !count) {
      return NextResponse.json(
        { error: 'Missing required fields: theme, difficulty, count' },
        { status: 400 }
      )
    }

    if (count < 1 || count > 20) {
      return NextResponse.json(
        { error: 'Count must be between 1 and 20' },
        { status: 400 }
      )
    }

    console.log('[Questions API] Generating', count, difficulty, 'questions about', theme)

    const questions = await fetchQuestionsFromOpenAI(theme, difficulty, count)

    return NextResponse.json({ questions })
  } catch (error) {
    console.error('[Questions API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate questions' },
      { status: 500 }
    )
  }
}

