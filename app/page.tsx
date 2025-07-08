'use client';

import React, { useState } from 'react';
import GameControls from '@/components/GameControls';
import TeamSelection from '@/components/TeamSelection';
import { useGameState } from '@/components/GameStateProvider';
import { PolymarketMarket } from '@/utils/polymarketApi';

interface GameInfo {
  market: PolymarketMarket;
  awayTeam: string;
  homeTeam: string;
  date: string;
}

export default function Home() {
  const { dispatch } = useGameState();
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);

  const handleMarketFound = (market: PolymarketMarket, awayTeam: string, homeTeam: string, date: string) => {
    setGameInfo({ market, awayTeam, homeTeam, date });
    
    // Update game state with team names
    dispatch({ 
      type: 'SET_GAME_STATE', 
      gameState: {
        homeScore: 0,
        awayScore: 0,
        inning: 1,
        isTopOfInning: true,
        outs: 0,
        strikes: 0,
        balls: 0,
        bases: {
          first: false,
          second: false,
          third: false,
        },
        homeTeam: homeTeam.toUpperCase(),
        awayTeam: awayTeam.toUpperCase(),
      }
    });
  };


  if (!gameInfo) {
    // Show team selection screen first
    return <TeamSelection onMarketFound={handleMarketFound} />;
  }

  // Show game simulation after teams are selected
  return (
    <main className="min-h-screen p-4 max-w-md mx-auto">
      {/* Game Controls */}
      <GameControls />
    </main>
  );
}