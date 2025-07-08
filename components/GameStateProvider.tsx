'use client';

import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { GameState } from '@/types/baseball';

interface GameStateContextType {
  gameState: GameState;
  dispatch: React.Dispatch<GameAction>;
  canUndo: boolean;
}

type GameAction =
  | { type: 'STRIKE' }
  | { type: 'BALL' }
  | { type: 'FOUL' }
  | { type: 'HIT_IN_PLAY'; outcome: string }
  | { type: 'STOLEN_BASE'; from: string; to: string }
  | { type: 'SCORE_RUN'; team: 'home' | 'away' }
  | { type: 'ADVANCE_INNING' }
  | { type: 'RESET_COUNT' }
  | { type: 'ADD_OUT' }
  | { type: 'CLEAR_BASES' }
  | { type: 'SET_BASE'; base: 'first' | 'second' | 'third'; occupied: boolean }
  | { type: 'RESET_GAME' }
  | { type: 'UNDO' }
  | { type: 'APPLY_PLAY_OUTCOME'; outcome: any }
  | { type: 'APPLY_BASE_PATH_OUTCOME'; outcome: any }
  | { type: 'SET_GAME_STATE'; gameState: GameState };

const initialGameState: GameState = {
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
  homeTeam: 'Home',
  awayTeam: 'Away',
};

interface GameStateWithHistory {
  current: GameState;
  history: GameState[];
}

const initialStateWithHistory: GameStateWithHistory = {
  current: initialGameState,
  history: []
};

function gameStateReducer(state: GameStateWithHistory, action: GameAction): GameStateWithHistory {
  // Handle undo action
  if (action.type === 'UNDO') {
    if (state.history.length > 0) {
      const previousState = state.history[state.history.length - 1];
      const newHistory = state.history.slice(0, -1);
      return {
        current: previousState,
        history: newHistory
      };
    }
    return state; // No history to undo
  }

  // Handle reset game action
  if (action.type === 'RESET_GAME') {
    return initialStateWithHistory;
  }

  // For all other actions, save current state to history and apply action
  const newHistory = [...state.history, state.current];
  // Keep only last 10 states to prevent memory issues
  const trimmedHistory = newHistory.slice(-10);

  const newGameState = (() => {
    switch (action.type) {
      case 'STRIKE':
        if (state.current.strikes === 2) {
          const newOuts = state.current.outs + 1;
          if (newOuts === 3) {
            return {
              ...state.current,
              outs: 0,
              strikes: 0,
              balls: 0,
              isTopOfInning: !state.current.isTopOfInning,
              inning: state.current.isTopOfInning ? state.current.inning : state.current.inning + 1,
              bases: { first: false, second: false, third: false },
            };
          }
          return { ...state.current, outs: newOuts, strikes: 0, balls: 0 };
        }
        return { ...state.current, strikes: state.current.strikes + 1 };

      case 'BALL':
        if (state.current.balls === 3) {
          // Walk - force advance runners
          let newBases = { ...state.current.bases };
          
          // If bases are loaded, score from third
          if (state.current.bases.first && state.current.bases.second && state.current.bases.third) {
            return {
              ...state.current,
              balls: 0,
              strikes: 0,
              bases: { first: true, second: true, third: true },
              homeScore: !state.current.isTopOfInning ? state.current.homeScore + 1 : state.current.homeScore,
              awayScore: state.current.isTopOfInning ? state.current.awayScore + 1 : state.current.awayScore,
            };
          }
          
          // If first and second occupied, advance third
          if (state.current.bases.first && state.current.bases.second) {
            newBases.third = true;
          }
          
          // If first occupied, advance to second
          if (state.current.bases.first) {
            newBases.second = true;
          }
          
          // Batter takes first
          newBases.first = true;
          
          return { ...state.current, balls: 0, strikes: 0, bases: newBases };
        }
        return { ...state.current, balls: state.current.balls + 1 };

      case 'FOUL':
        if (state.current.strikes < 2) {
          return { ...state.current, strikes: state.current.strikes + 1 };
        }
        return state.current;

      case 'RESET_COUNT':
        return { ...state.current, strikes: 0, balls: 0 };

      case 'ADD_OUT':
        const newOuts = state.current.outs + 1;
        if (newOuts === 3) {
          return {
            ...state.current,
            outs: 0,
            strikes: 0,
            balls: 0,
            isTopOfInning: !state.current.isTopOfInning,
            inning: state.current.isTopOfInning ? state.current.inning : state.current.inning + 1,
            bases: { first: false, second: false, third: false },
          };
        }
        return { ...state.current, outs: newOuts, strikes: 0, balls: 0 };

      case 'SCORE_RUN':
        return {
          ...state.current,
          homeScore: action.team === 'home' ? state.current.homeScore + 1 : state.current.homeScore,
          awayScore: action.team === 'away' ? state.current.awayScore + 1 : state.current.awayScore,
        };

      case 'SET_BASE':
        return {
          ...state.current,
          bases: {
            ...state.current.bases,
            [action.base]: action.occupied,
          },
        };

      case 'CLEAR_BASES':
        return {
          ...state.current,
          bases: { first: false, second: false, third: false },
        };

      case 'ADVANCE_INNING':
        return {
          ...state.current,
          isTopOfInning: !state.current.isTopOfInning,
          inning: state.current.isTopOfInning ? state.current.inning : state.current.inning + 1,
          outs: 0,
          strikes: 0,
          balls: 0,
          bases: { first: false, second: false, third: false },
        };

      case 'APPLY_PLAY_OUTCOME':
        // Apply all effects of a play outcome in one action
        let newState = { ...state.current };
        
        // Reset count
        newState.strikes = 0;
        newState.balls = 0;
        
        // Apply runs scored
        for (let i = 0; i < action.outcome.runsScored; i++) {
          if (state.current.isTopOfInning) {
            newState.awayScore += 1;
          } else {
            newState.homeScore += 1;
          }
        }
        
        // Apply outs gained
        newState.outs += action.outcome.outsGained;
        
        // Check if inning ends due to outs
        if (newState.outs >= 3) {
          newState.outs = 0;
          newState.isTopOfInning = !newState.isTopOfInning;
          newState.inning = state.current.isTopOfInning ? newState.inning : newState.inning + 1;
          newState.bases = { first: false, second: false, third: false };
        } else {
          // Set final base configuration
          newState.bases = {
            first: action.outcome.finalBases.first,
            second: action.outcome.finalBases.second,
            third: action.outcome.finalBases.third,
          };
        }
        
        return newState;

      case 'APPLY_BASE_PATH_OUTCOME':
        // Apply all effects of a base path outcome in one action
        let newBaseState = { ...state.current };
        
        // Apply runs scored
        for (let i = 0; i < action.outcome.runsScored; i++) {
          if (state.current.isTopOfInning) {
            newBaseState.awayScore += 1;
          } else {
            newBaseState.homeScore += 1;
          }
        }
        
        // Apply outs gained
        newBaseState.outs += action.outcome.outsGained;
        
        // Check if inning ends due to outs
        if (newBaseState.outs >= 3) {
          newBaseState.outs = 0;
          newBaseState.isTopOfInning = !newBaseState.isTopOfInning;
          newBaseState.inning = state.current.isTopOfInning ? newBaseState.inning : newBaseState.inning + 1;
          newBaseState.bases = { first: false, second: false, third: false };
        } else {
          // Set final base configuration
          newBaseState.bases = {
            first: action.outcome.finalBases.first,
            second: action.outcome.finalBases.second,
            third: action.outcome.finalBases.third,
          };
        }
        
        return newBaseState;

      case 'SET_GAME_STATE':
        // Set entire game state (for game state editor)
        return action.gameState;

      default:
        return state.current;
    }
  })();

  return {
    current: newGameState,
    history: trimmedHistory
  };
}

const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

export function GameStateProvider({ children }: { children: ReactNode }) {
  const [stateWithHistory, dispatch] = useReducer(gameStateReducer, initialStateWithHistory);

  return (
    <GameStateContext.Provider value={{ 
      gameState: stateWithHistory.current, 
      dispatch,
      canUndo: stateWithHistory.history.length > 0
    }}>
      {children}
    </GameStateContext.Provider>
  );
}

export function useGameState() {
  const context = useContext(GameStateContext);
  if (context === undefined) {
    throw new Error('useGameState must be used within a GameStateProvider');
  }
  return context;
}