import type { SpaceteamState } from './spaceteam'
import type { SeaBattleState } from './seabattle'

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

export const DEFAULT_AI_MODEL = 'gpt-5.6-luna' // Cost-optimised 5.6, plenty for trivia

export const aiModels: AIModel[] = [
  // Cheapest of the 5.6 suite. A whole game costs a fraction of a cent.
  { id: DEFAULT_AI_MODEL, name: 'GPT-5.6 Luna (Default)', description: '$0.20/$1.20 per 1M tok - cost-optimised, best value for trivia' },

  // Mid-tier: worth it for hard themes or long custom prompts.
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', description: '$2/$12 per 1M tok - balanced intelligence and cost' },

  // Frontier: only for rich, creative or genuinely difficult content.
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', description: '$5/$30 per 1M tok - frontier model, expensive' },
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

export type GameMode = 'standard' | 'emoji' | 'personality' | 'custom' | 'headsup' | 'spaceteam' | 'seabattle'

/** One card decided during a Heads Up turn. */
export type HeadsUpCardResult = {
  word: string
  got: boolean
}

/**
 * Heads Up state, persisted in the rooms.heads_up JSONB column.
 *
 * turnStartedAt is the anchor every device counts down from, so the guesser and
 * the clue-givers see the same number instead of drifting local timers.
 */
export type HeadsUpState = {
  deckId: string
  deckName: string
  words: string[]
  /** Player ids in turn order. */
  order: string[]
  turnIndex: number
  cardIndex: number
  roundSeconds: number
  turnStartedAt?: string
  results: Record<string, HeadsUpCardResult[]>
}

export const ROUND_LENGTHS = [30, 60, 90] as const

export const emptyHeadsUpState = (): HeadsUpState => ({
  deckId: '',
  deckName: '',
  words: [],
  order: [],
  turnIndex: 0,
  cardIndex: 0,
  roundSeconds: 60,
  results: {},
})

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
  // Only used by the 'headsup' game mode.
  headsUp?: HeadsUpState
  // Only used by the 'spaceteam' game mode. Written through its own endpoint.
  spaceteam?: SpaceteamState
  // Public half of the 'seabattle' mode. The fleets live server-side only.
  seaBattle?: SeaBattleState
}

export const gameModes = [
  { id: 'standard', name: '🎯 Standard Trivia', description: 'Classic multiple-choice trivia with themes' },
  { id: 'emoji', name: '😎 Emoji Decoder', description: 'Decode emojis into answers' },
  { id: 'personality', name: '👥 Personality Mode', description: 'Vote on which player fits best (popular vote)' },
  { id: 'custom', name: '✨ Custom Theme', description: 'Create your own theme or let AI surprise you' },
  { id: 'headsup', name: '🙈 Heads Up!', description: 'Phone on your forehead, everyone shouts clues, tilt to score' },
  { id: 'spaceteam', name: '🚀 Spaceteam', description: 'Co-op panic: your instructions are for somebody else’s panel' },
  { id: 'seabattle', name: '🚢 Sea Battle', description: 'Two hidden fleets, alternating shots, a hit buys another go' },
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


