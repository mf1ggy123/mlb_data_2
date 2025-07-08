import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { GameStateProvider } from '@/components/GameStateProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Baseball Tracker - Live Game Scoring',
  description: 'Mobile-first baseball game tracking and scoring app',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <GameStateProvider>
          {children}
        </GameStateProvider>
      </body>
    </html>
  )
}