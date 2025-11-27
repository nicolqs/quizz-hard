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

export const DEFAULT_AI_MODEL = 'gpt-4o-mini' // Fast & cheap default

export const aiModels: AIModel[] = [
  // Dialogue & Rich Content
  { id: 'gpt-5.1', name: 'GPT-5.1 (Flagship)', description: 'Best for rich story, complex questions' },
  { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Strong general model for detailed content' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Cheaper, good enough for most questions' },
  
  // Fast & Low Cost
  { id: DEFAULT_AI_MODEL, name: 'GPT-4o Mini (Fast)', description: 'Fast + cheap, great for quick trivia' },
  { id: 'gpt-5.1-mini', name: 'GPT-5.1 Mini', description: 'Good balance of speed & quality' },
  
  // Reasoning & Complex Logic
  { id: 'o4-mini', name: 'O4 Mini (Reasoning)', description: 'Best for puzzles & logic questions' },
]

export type Question = {
  question: string
  choices: string[]
  correctIndex: number
  explanation?: string
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


