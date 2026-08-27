import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nix Games - Party Quiz',
  description: 'Jackbox-style multiplayer quiz game with AI-generated questions',
}

// Phones are the primary controller for this game, so the viewport is declared
// explicitly rather than left to Next's default. viewportFit lets the page paint
// under the notch and home indicator; globals.css pads the content back out with
// the safe-area insets. Pinch zoom stays available on purpose (blocking it is an
// accessibility regression, and iOS ignores user-scalable=no anyway) - the
// unwanted double-tap zoom is killed with touch-action instead.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0f172a',
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
