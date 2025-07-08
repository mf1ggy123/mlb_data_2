'use client';

import React from 'react';
import { useGameState } from './GameStateProvider';

export default function Scoreboard() {
  const { gameState } = useGameState();

  return (
    <div className="bg-black text-white p-4 rounded-lg shadow-lg mb-4">
      {/* Teams and Scores */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex-1">
          <div className="text-sm text-gray-300">AWAY</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-away-team">{gameState.awayTeam}</span>
            <span className="text-2xl font-bold">{gameState.awayScore}</span>
          </div>
        </div>
        
        <div className="flex-1 text-right">
          <div className="text-sm text-gray-300">HOME</div>
          <div className="flex items-center justify-end gap-2">
            <span className="text-2xl font-bold">{gameState.homeScore}</span>
            <span className="text-lg font-bold text-home-team">{gameState.homeTeam}</span>
          </div>
        </div>
      </div>

      {/* Inning and Game State */}
      <div className="grid grid-cols-3 gap-4 text-center border-t border-gray-600 pt-3">
        <div>
          <div className="text-xs text-gray-300 uppercase">Inning</div>
          <div className="text-lg font-bold">
            {gameState.isTopOfInning ? '▲' : '▼'} {gameState.inning}
          </div>
          <div className="text-xs text-gray-400">
            {gameState.isTopOfInning ? 'Top' : 'Bottom'}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-300 uppercase">Count</div>
          <div className="text-lg font-bold">
            {gameState.balls}-{gameState.strikes}
          </div>
          <div className="text-xs text-gray-400">B-S</div>
        </div>

        <div>
          <div className="text-xs text-gray-300 uppercase">Outs</div>
          <div className="text-lg font-bold">{gameState.outs}</div>
          <div className="flex justify-center gap-1 mt-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < gameState.outs ? 'bg-red-500' : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}