# 🎮 Nix Games - Real-Time Multiplayer Quiz

A Jackbox-style multiplayer quiz game with AI-generated questions. Built with **Next.js 15**, **React 19**, and **PostgreSQL**.

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8)](https://tailwindcss.com/)

## ✨ Features

- 🎯 **Real-time multiplayer** - Play with friends across devices
- 🙈 **Heads Up!** - Phone on your forehead, the room shouts clues, tilt to score
- 🎮 **2 Player Games** - One phone between two people: ping pong, sumo, reaction duel
- 🤖 **AI-generated questions** - Powered by the OpenAI GPT-5.6 suite
- 🎨 **Beautiful UI** - Modern design with Tailwind CSS
- ⚡ **Fast updates** - Server-Sent Events for real-time synchronization
- 🗄️ **Persistent storage** - PostgreSQL database via Neon
- 📱 **Fully responsive** - Works on desktop, tablet, and mobile
- 🔒 **Secure** - API keys stay on the server

## 🎮 Demo

Create a room, share the link with friends, and start playing!

- **Admin**: Configure game settings and control the flow
- **Players**: Join with a code, answer questions, compete on the leaderboard
- **Real-time**: All players see updates instantly

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or Bun
- pnpm (recommended) or npm
- A [Neon](https://neon.tech) PostgreSQL database (free tier available)
- (Optional) OpenAI API key for custom questions

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/nix-games.git
cd nix-games
```

### 2. Install Dependencies

```bash
pnpm install
# or
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
# Required: Neon PostgreSQL connection string
DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require

# Required for trivia and AI decks: there is no offline question bank.
# Heads Up's built-in decks and the 2-player games work without it.
OPENAI_API_KEY=sk-your-key-here
```

### 4. Set Up Database

1. Create a free [Neon](https://neon.tech) account
2. Create a new project
3. Copy the connection string to your `.env` file
4. Run the SQL schema:

```bash
# In Neon SQL Editor, paste the contents of neon-schema.sql
```

Or copy from `neon-schema.sql` in this repo.

**Upgrading an existing database?** Run the files in `migrations/` in order. The
latest one, `002_heads_up.sql`, adds the `heads_up` column the Heads Up! mode
stores its state in.

### 5. Run Development Server

```bash
pnpm dev
# or
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 How to Play

### For Hosts (Admin):

1. Go to `/admin`
2. Enter your name
3. Choose theme, difficulty, and number of questions
4. Click **"Generate Room"**
5. Share the auto-copied link with players
6. Click **"Start Game"** when everyone has joined
7. Advance through questions and see results

### For Players:

1. Open the share link from the host
2. Enter your name
3. Click **"Join Room"**
4. Wait for the host to start
5. Answer questions within 8 seconds
6. See your score on the live leaderboard

## 🏗️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Frontend**: [React 19](https://react.dev/), TypeScript
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Database**: [Neon](https://neon.tech) (PostgreSQL)
- **Real-time**: Server-Sent Events (SSE)
- **AI**: [OpenAI](https://openai.com/) GPT-5.6 (Luna by default, Terra and Sol selectable)
- **Deployment**: [Vercel](https://vercel.com/)

## 📁 Project Structure

```
nix-games/
├── app/
│   ├── admin/              # Admin page for creating rooms
│   │   └── page.tsx
│   ├── api/                # API routes
│   │   ├── generate-questions/  # OpenAI question generation
│   │   ├── rooms/               # Room CRUD operations
│   │   └── rooms-stream/        # SSE streaming for real-time
│   ├── page.tsx            # Player page for joining rooms
│   ├── layout.tsx          # Root layout
│   └── globals.css         # Global styles
├── components/
│   └── SectionCard.tsx     # Reusable UI components
├── lib/
│   ├── api.ts              # API client (fetch + SSE)
│   ├── storage.ts          # Room storage logic
│   ├── questions.ts        # Question fetching
│   ├── types.ts            # TypeScript types
│   └── utils.ts            # Helper functions
├── neon-schema.sql         # Database schema
└── package.json
```

## 🎨 Game Features

### 20+ Themes
- General Knowledge, History, Geography, Movies, TV Shows
- Music, Sports, Science, Technology, Video Games
- Internet Culture & Memes, Animals & Nature
- Food & Cooking, Travel, Literature, Art
- Fashion, Business, Crypto, Fitness, and more!

### 🙈 Heads Up!
Charades for a room with energy. One player holds their phone to their forehead
with the screen facing out, everyone else shouts clues, and the guesser **tilts
down for correct, up to pass** against the clock. Turns rotate through the whole
lobby and the scores add up.

- **8 built-in decks** (Celebrities, Animals, Movies, Accents, Characters,
  Sports, Food & Drink, Internet Culture) that work offline with no API key
- **Any theme** - type one and the AI writes a deck through `/api/generate-deck`
- **30 / 60 / 90 second** rounds
- Every device sees the same word and the same countdown, so the room stays in sync

**Tilt needs a secure origin.** iOS Safari also needs a one-time permission tap,
which is why the guesser screen shows an "Enable tilt" button. Over plain `http`
on a LAN, or on a laptop, the card falls back to tap controls: bottom half for
correct, top half to pass. The screen is kept awake for the length of a turn
where the browser supports it.

### 🎮 2 Player Games (`/duel`)
No room code, no network, no account. Lay one phone flat between two people:
player one takes the top half (their score bar is rotated to face them), player
two the bottom. First to 3 points wins the match.

- **Ping Pong** - slide a thumb along your half to move your paddle. Hitting the
  ball off-centre angles the return, so rallies build instead of metronoming
- **Sumo** - press and drag anywhere in your half to thrust. Shove the other
  disc out of the ring, and mind your own momentum
- **Reaction** - wait for green then be first. Tapping early hands over the point

Every pointer is claimed by the half it started in, so two thumbs on one screen
never steal each other's controls.

### 4 Difficulty Levels
- **Easy**: 10 points + speed bonus
- **Medium**: 20 points + speed bonus
- **Hard**: 35 points + speed bonus
- **Impossible**: 50 points + speed bonus

### Game Settings
- 3-15 questions per game
- 8 seconds per question (customizable 8-45s)
- Real-time leaderboard
- Score tracking with speed bonus

## 🧪 Tests

Playwright scripts, each pointed at a running dev server via `BASE_URL`:

```bash
node scripts/smoke.mjs        # error handling when OPENAI_API_KEY is missing
node scripts/multiplayer.mjs  # 4 devices through a full trivia round (calls OpenAI)
node scripts/headsup.mjs      # 3 devices through two Heads Up turns (no API key needed)
node scripts/duel.mjs         # all three 2-player games, scoring and match end (no API key needed)
```

They stub `/api/rooms/[code]` with an in-process store, so no database is needed.

## 🚀 Deployment

### Deploy to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/nix-games)

1. Click the button above or:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

2. Add environment variables in Vercel dashboard:
   - `DATABASE_URL` (required)
   - `OPENAI_API_KEY` (optional)

3. Done! Your app is live 🎉

## 🔒 Security

- ✅ API keys are server-side only (never exposed to browser)
- ✅ Environment variables for sensitive data
- ✅ `.env` file is gitignored
- ✅ Input validation on all API routes
- ✅ CORS headers configured properly

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Type checking
pnpm lint
```

## 📊 API Routes

### `POST /api/generate-questions`
Generate trivia questions

**Request:**
```json
{
  "theme": "General Knowledge",
  "difficulty": "medium",
  "count": 8
}
```

**Response:**
```json
{
  "questions": [
    {
      "question": "Which planet is known as the Red Planet?",
      "choices": ["Mars", "Venus", "Jupiter", "Mercury"],
      "correctIndex": 0
    }
  ]
}
```

### `GET /api/rooms/[code]`
Fetch room by code

### `PUT /api/rooms/[code]`
Create or update room

### `GET /api/rooms-stream/[code]`
SSE stream for real-time room updates

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by Jackbox Party Pack games
- Built with Next.js 15 and React 19
- Questions powered by the OpenAI GPT-5.6 suite
- Database hosted on Neon PostgreSQL
- Deployed on Vercel

## 📧 Contact

**Nico Vincent**

- GitHub: [@YOUR_GITHUB_USERNAME](https://github.com/YOUR_GITHUB_USERNAME)
- Website: [your-website.com](https://your-website.com)

## 🎯 Roadmap

- [ ] Websocket support for even faster updates
- [ ] Audio/visual effects for correct answers
- [ ] Custom question uploads
- [ ] Room expiration and cleanup
- [ ] Player avatars
- [ ] Team mode
- [ ] Tournament brackets
- [ ] Analytics dashboard
- [ ] Mobile app (React Native)

---

**Made with ❤️ by Nico Vincent**

If you like this project, please give it a ⭐ on GitHub!
