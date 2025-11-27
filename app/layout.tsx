import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nix Games - Party Quiz',
  description: 'Jackbox-style multiplayer quiz game with AI-generated questions',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

