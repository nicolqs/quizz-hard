export type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible'

export const difficultyPoints: Record<Difficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 35,
  impossible: 50,
}

export type AIModel = {
  id: string
  name: string
  description: string
}

export const DEFAULT_AI_MODEL = 'gpt-5.4-nano' // Newer nano - good quality, ~$0.0014 per game

export const aiModels: AIModel[] = [
  // Cheapest - recommended for trivia (each game costs a fraction of a cent)
  { id: DEFAULT_AI_MODEL, name: 'GPT-5.4 Nano (Default)', description: '$0.20/$1.25 per 1M tok - newer, ~$0.0014 per game' },
  { id: 'gpt-5-nano', name: 'GPT-5 Nano (Cheapest)', description: '$0.05/$0.40 per 1M tok - ~$0.0004 per game' },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', description: '$0.10/$0.40 per 1M tok - similar price, older' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '$0.15/$0.60 per 1M tok - safe fallback' },

  // Mid-tier
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: '$0.25/$2.00 per 1M tok - better at hard questions' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Cheaper mid-tier, good enough for most questions' },
  { id: 'gpt-5.1-mini', name: 'GPT-5.1 Mini', description: 'Good balance of speed & quality' },

  // Flagship (much more expensive - only for hard/creative themes)
  { id: 'gpt-5.4', name: 'GPT-5.4', description: '$2.50/$15 per 1M tok - flagship, expensive' },
  { id: 'gpt-5.1', name: 'GPT-5.1', description: 'Best for rich story, complex questions' },
  { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Strong general model for detailed content' },

  // Reasoning
  { id: 'o4-mini', name: 'O4 Mini (Reasoning)', description: 'Best for puzzles & logic questions' },
]

export type Question = {
  question: string
  choices: string[]
  correctIndex: number
}

export type GenerateQuestionsResponse = {
  questions: Question[]
  generatedTheme?: string // For AI-Generated Theme mode
}

export type Player = {
  id: string
  name: string
  score: number
}

export type Response = {
  answerIndex: number
  remaining: number
  votedFor?: string // For personality mode: player ID that was voted for
}

export type GameMode = 'standard' | 'emoji' | 'personality' | 'custom'

export type Room = {
  code: string
  hostName: string
  gameMode: GameMode
  theme: string // For standard mode: selected theme, for custom mode: user input theme
  generatedTheme?: string // For custom mode with AI generation
  aiModel: string // AI model ID to use for question generation
  difficulty: Difficulty
  questionCount: number
  timePerQuestion: number
  players: Player[]
  questions: Question[]
  currentIndex: number
  status: 'lobby' | 'generating' | 'question' | 'results' | 'final'
  responses: Record<string, Response>
  lastGain: Record<string, number>
  // Questions seen in previous rounds of this room (used to avoid repeats on restart)
  askedQuestions?: string[]
  // Incremented every time a new round of questions starts (lets clients reset stale UI)
  round?: number
}

export const gameModes = [
  { id: 'standard', name: '🎯 Standard Trivia', description: 'Classic multiple-choice trivia with themes' },
  { id: 'emoji', name: '😎 Emoji Decoder', description: 'Decode emojis into answers' },
  { id: 'personality', name: '👥 Personality Mode', description: 'Vote on which player fits best (popular vote)' },
  { id: 'custom', name: '✨ Custom Theme', description: 'Create your own theme or let AI surprise you' },
] as const

export const themes = [
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


