import Link from 'next/link'
import { SectionCard } from './SectionCard'

// Nico's other games. They live outside this app, so they open in a new tab and
// an in-progress room is never lost.
export const externalGames = [
  {
    name: 'Uno',
    emoji: '🃏',
    href: 'https://uno.nicolqs.workers.dev',
    blurb: 'Pick a name and join. Multiplayer in the browser, nothing to install',
  },
  {
    name: 'Le Génie',
    emoji: '🧞',
    href: 'https://akinator-nicolqs-projects.vercel.app',
    blurb: 'Think of anyone and let the genie guess it. Français, English, Español',
  },
]

export function ExternalGames() {
  return (
    <SectionCard title="Also fun" accent="from-secondary/20 to-primary/20">
      <Link
        href="/duel"
        className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-3 transition hover:border-primary/60"
      >
        <span className="text-2xl">🎮</span>
        <span className="min-w-0">
          <span className="block font-semibold text-primary">2 Player Games</span>
          <span className="block text-xs text-white/60">
            One phone between two people: ping pong, sumo, reaction duel
          </span>
        </span>
      </Link>

      <p className="mt-4 text-sm text-white/70">More of Nico&apos;s games. These open in a new tab.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {externalGames.map((game) => (
          <a
            key={game.name}
            href={game.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3 transition hover:border-primary/40 hover:bg-white/10"
          >
            <span className="text-2xl">{game.emoji}</span>
            <span className="min-w-0">
              <span className="block font-semibold">
                {game.name} <span className="text-xs font-normal text-white/40">↗</span>
              </span>
              <span className="block text-xs text-white/60">{game.blurb}</span>
            </span>
          </a>
        ))}
      </div>
    </SectionCard>
  )
}
