export type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible'

export const difficultyPoints: Record<Difficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 35,
  impossible: 50,
}

export type Question = {
  question: string
  choices: string[]
  correctIndex: number
  explanation?: string
}

export type Player = {
  id: string
  name: string
  score: number
}

export type Response = {
  answerIndex: number
  remaining: number
}

export type Room = {
  code: string
  hostName: string
  theme: string
  difficulty: Difficulty
  questionCount: number
  timePerQuestion: number
  players: Player[]
  questions: Question[]
  currentIndex: number
  status: 'lobby' | 'question' | 'results' | 'final'
  responses: Record<string, Response>
  lastGain: Record<string, number>
}

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

