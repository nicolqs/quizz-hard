# Nix Games

A single-page Jackbox-style multiplayer trivia experience built with Vite, React, TypeScript, and Tailwind CSS. Everything runs in-memory (no backend) so you can spin up a lobby, invite friends locally, and play through AI-generated multiple-choice questions.

## Running locally

```bash
npm install
npm run dev
```

Set `OPENAI_API_KEY` inside `src/App.tsx` (or expose it via your environment) to enable live question generation. Without a key the app falls back to curated sample questions.
