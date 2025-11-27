import type { Difficulty, GameMode, Question } from '@/lib/types'
import { NextRequest, NextResponse } from 'next/server'

const GAME_MODELS = {
    "dialogue_and_narration": [
        "gpt-5.1",          // flagship for rich story, NPC dialog, complex logic
        "gpt-4.1",          // strong general model for story + instructions :contentReference[oaicite:0]{index=0}
        "gpt-4.1-mini"      // cheaper, good enough for most in-game dialog :contentReference[oaicite:1]{index=1}
    ],
    "fast_low_cost_in_game_logic": [
        "gpt-4o-mini",      // fast + cheap, great for quick choices, hints, item descriptions :contentReference[oaicite:2]{index=2}
        "gpt-5.1-mini"      // successor small model, good balance of speed & quality :contentReference[oaicite:3]{index=3}
    ],
    "reasoning_or_complex_rules": [
        "o4-mini",          // reasoning-oriented, good for puzzles / rule-heavy systems :contentReference[oaicite:4]{index=4}
        // "o3-mini"           // also reasoning-focused, for trickier logic or AI “DM” roles :contentReference[oaicite:5]{index=5}
    ],
    // "image_or_card_art": [
    //     "gpt-image-1"       // for generating item art, cards, backgrounds, etc. :contentReference[oaicite:6]{index=6}
    // ],
    // "code_tools_for_building_games": [
    //     "gpt-5.1-codex-mini"  // for generating game code, scripts, tools, pipelines :contentReference[oaicite:7]{index=7}
    // ]
}

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

const emojiFallbackBank: Question[] = [
  {
    question: '🦁👑',
    choices: ['The Lion King', 'The Jungle Book', 'Madagascar', 'Tarzan'],
    correctIndex: 0,
  },
  {
    question: '🧪⚗️👨‍🔬',
    choices: ['Biology', 'Physics', 'Chemistry', 'Medicine'],
    correctIndex: 2,
  },
  {
    question: '🍕🇮🇹',
    choices: ['Pizza', 'Pasta', 'Gelato', 'Risotto'],
    correctIndex: 0,
  },
  {
    question: '🎸🎵🎤',
    choices: ['Concert', 'Orchestra', 'Opera', 'Musical'],
    correctIndex: 0,
  },
  {
    question: '🏀🏆🏅',
    choices: ['Basketball Championship', 'Soccer Finals', 'Tennis Tournament', 'Baseball League'],
    correctIndex: 0,
  },
]

async function generateUniqueTheme(aiModel: string): Promise<string> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
  
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_KEY_HERE') {
    const fallbackThemes = [
      'Trivia from the year 2000',
      'Questions only a pirate would know',
      'Impossible facts about breakfast cereals',
      'Facts stranger than fiction',
    ]
    return fallbackThemes[Math.floor(Math.random() * fallbackThemes.length)]
  }

  try {
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
            content: 'Generate ONE unique and creative trivia theme that would be fun for a party quiz game. Make it quirky, unexpected, and engaging. Examples: "Trivia from the year you were born", "Questions only a pirate would know", "Impossible facts about breakfast cereals". Respond with ONLY the theme name, nothing else.',
          },
        ],
        temperature: 1.0,
        max_tokens: 50,
      }),
    })

    const data = await res.json()
    const generatedTheme = data?.choices?.[0]?.message?.content?.trim() || 'Random Trivia'
    console.log('[Questions] Generated unique theme:', generatedTheme)
    return generatedTheme
  } catch (err) {
    console.error('[Questions] Failed to generate theme:', err)
    return 'Surprise Trivia Challenge'
  }
}

async function fetchQuestionsFromOpenAI(
  theme: string,
  difficulty: Difficulty,
  count: number,
  aiModel: string,
  gameMode: GameMode = 'standard',
  playerNames?: string[],
  shouldGenerateTheme?: boolean,
): Promise<{ questions: Question[]; generatedTheme?: string }> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
  
  // Generate unique theme if needed (for custom mode with AI generation)
  let actualTheme = theme
  let generatedTheme: string | undefined
  if (gameMode === 'custom' && shouldGenerateTheme) {
    generatedTheme = await generateUniqueTheme(aiModel)
    actualTheme = generatedTheme
  }
  
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_KEY_HERE') {
    console.log('[Questions] No OpenAI key, using fallback questions')
    const questions = Array.from({ length: count }, (_, i) =>
      gameMode === 'emoji' ? emojiFallbackBank[i % emojiFallbackBank.length] : fallbackBank[i % fallbackBank.length],
    )
    return { questions, generatedTheme }
  }

  try {
    let userPrompt: string
    
    if (gameMode === 'emoji') {
      userPrompt = `Create ${count} ${difficulty} emoji decoder questions. Each question should be a series of emojis (2-5 emojis) that represent a famous movie, book, song, place, concept, or phrase. The choices should be text answers where one is correct. Make the emojis creative and fun! Examples: 🦁👑 = "The Lion King", 🧪⚗️👨‍🔬 = "Chemistry", 🏰🐭✨ = "Disneyland". Respond with a JSON array where each item has {"question": string (ONLY emojis), "choices": [4 strings], "correctIndex": 0-3}. Vary the categories (movies, places, concepts, songs, books, etc).`
    } else if (gameMode === 'personality') {
      const players = playerNames && playerNames.length > 0 ? playerNames : ['Player 1', 'Player 2', 'Player 3', 'Player 4']
      userPrompt = `Create ${count} fun "most likely to" or personality questions about these players: ${players.join(', ')}. Each question should be about which player would do something or has a certain trait. Examples: "Who is most likely to be late?", "Who can do the most push-ups?", "Who would survive longest on a desert island?". The choices should be the player names. IMPORTANT: Do NOT include a correctIndex field - this is a popular vote game where players vote for their choice. Respond with a JSON array where each item has {"question": string, "choices": [all player names as strings]}.`
    } else {
      // Standard or custom mode
      userPrompt = `Create ${count} ${difficulty} trivia questions about ${actualTheme}. Respond with a JSON array where each item has {"question": string, "choices": [4 strings], "correctIndex": 0-3}. Keep text concise.`
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
              'You generate lively multiple-choice trivia. Answer ONLY with valid JSON.',
          },
          {
            role: 'user',
            content: userPrompt,
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
    console.log(parsed)
    // For personality mode, ensure correctIndex is set to 0 (it will be overridden by popular vote)
    if (gameMode === 'personality') {
      parsed.forEach(q => {
        if (q.correctIndex === undefined) {
          q.correctIndex = 0 // Placeholder, won't be used
        }
      })
    }
    
    return { questions: parsed.slice(0, count), generatedTheme }
  } catch (err) {
    console.error('[Questions] OpenAI fetch failed, using fallback:', err)
    const questions = Array.from({ length: count }, (_, i) =>
      gameMode === 'emoji' ? emojiFallbackBank[(i + 1) % emojiFallbackBank.length] : fallbackBank[(i + 1) % fallbackBank.length],
    )
    return { questions, generatedTheme }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { theme, difficulty, count, aiModel, playerNames, shouldGenerateTheme, gameMode } = await request.json()

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

    // Default to GPT-4o Mini if no model specified
    const modelToUse = aiModel || 'gpt-4o-mini'
    const mode: GameMode = gameMode || 'standard'

    console.log('[Questions API] Generating', count, difficulty, 'questions about', theme, 'using', modelToUse, 'mode:', mode)

    const result = await fetchQuestionsFromOpenAI(theme, difficulty, count, modelToUse, mode, playerNames, shouldGenerateTheme)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Questions API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate questions' },
      { status: 500 }
    )
  }
}

