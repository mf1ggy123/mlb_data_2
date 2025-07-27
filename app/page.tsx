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
  username?: string;
  loadedGameState?: any;
}

export default function Home() {
  const { dispatch } = useGameState();
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);

  const handleMarketFound = (market: PolymarketMarket, awayTeam: string, homeTeam: string, date: string, username?: string, loadedGameState?: any) => {
    console.log('🎯 handleMarketFound called with:', {
      market: market?.question || 'No market',
      awayTeam,
      homeTeam,
      date,
      username,
      hasLoadedGameState: !!loadedGameState,
      loadedGameState
    });

    setGameInfo({ market, awayTeam, homeTeam, date, username, loadedGameState });
    
    // Update game state - use loaded state if available, otherwise create new
    const gameState = loadedGameState?.gameState ? {
      ...loadedGameState.gameState,
      // Always ensure team names are set correctly
      homeTeam: homeTeam.toUpperCase(),
      awayTeam: awayTeam.toUpperCase(),
    } : {
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
    };

    console.log('🎮 Setting game state to:', gameState);

    dispatch({ 
      type: 'SET_GAME_STATE', 
      gameState: gameState
    });

    // If loading a saved game, log the restored state
    if (loadedGameState) {
      console.log('🔄 Restored game state from save:', loadedGameState);
      console.log('💰 Restored balance:', loadedGameState.balance);
    }
  };


  if (!gameInfo) {
    // Show team selection screen first
    return <TeamSelection onMarketFound={handleMarketFound} />;
  }

  // Show game simulation after teams are selected
  return (
    <main className="min-h-screen p-4 max-w-md mx-auto">
      {/* Game Controls */}
      <GameControls username={gameInfo.username} />
    </main>
  );
}