'use client';

import React from 'react';
import { useGameState } from './GameStateProvider';

export default function BaseballDiamond() {
  const { gameState } = useGameState();

  return (
    <div className="bg-baseball-green p-4 rounded-lg shadow-lg mb-4">
      <div className="relative w-full h-32 mx-auto">
        {/* Diamond shape */}
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full"
          style={{ filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.3))' }}
        >
          {/* Infield dirt */}
          <path
            d="M100 160 L40 100 L100 40 L160 100 Z"
            fill="#D2691E"
            stroke="#8B4513"
            strokeWidth="2"
          />
          
          {/* Grass areas */}
          <path
            d="M20 180 L40 100 L100 40 L160 100 L180 180 Z"
            fill="#228B22"
            opacity="0.7"
          />

          {/* Bases */}
          {/* Home Plate */}
          <polygon
            points="100,175 92,162 100,150 108,162"
            fill="white"
            stroke="#000"
            strokeWidth="3"
          />
          
          {/* First Base */}
          <rect
            x="150"
            y="90"
            width="20"
            height="20"
            fill={gameState.bases.first ? "#FFD700" : "white"}
            stroke="#000"
            strokeWidth="3"
            transform="rotate(45 160 100)"
          />
          
          {/* Second Base */}
          <rect
            x="90"
            y="30"
            width="20"
            height="20"
            fill={gameState.bases.second ? "#FFD700" : "white"}
            stroke="#000"
            strokeWidth="3"
            transform="rotate(45 100 40)"
          />
          
          {/* Third Base */}
          <rect
            x="30"
            y="90"
            width="20"
            height="20"
            fill={gameState.bases.third ? "#FFD700" : "white"}
            stroke="#000"
            strokeWidth="3"
            transform="rotate(45 40 100)"
          />

          {/* Base paths */}
          <path
            d="M100 160 L160 100"
            stroke="white"
            strokeWidth="1"
            strokeDasharray="2,2"
            opacity="0.8"
          />
          <path
            d="M160 100 L100 40"
            stroke="white"
            strokeWidth="1"
            strokeDasharray="2,2"
            opacity="0.8"
          />
          <path
            d="M100 40 L40 100"
            stroke="white"
            strokeWidth="1"
            strokeDasharray="2,2"
            opacity="0.8"
          />
          <path
            d="M40 100 L100 160"
            stroke="white"
            strokeWidth="1"
            strokeDasharray="2,2"
            opacity="0.8"
          />

          {/* Pitcher's mound */}
          <circle
            cx="100"
            cy="100"
            r="6"
            fill="#D2691E"
            stroke="#8B4513"
            strokeWidth="1"
          />
          <circle
            cx="100"
            cy="100"
            r="2"
            fill="white"
          />

        </svg>
      </div>

    </div>
  );
}