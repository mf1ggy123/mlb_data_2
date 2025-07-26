'use client';

import React, { useState } from 'react';
import { useGameState } from './GameStateProvider';
import { PlayOption, StealOption } from '@/types/baseball';
import { 
  getInPlayOutcomes, 
  getAllInPlayOutcomes,
  getBasePathOutcomes, 
  filterOutcomesByQuality,
  filterBasePathOutcomesByQuality,
  getRandomOutcome,
  PlayOutcome 
} from '@/utils/baseballData';
import GameStateEditor from './GameStateEditor';
import { GameState } from '@/types/baseball';
import Scoreboard from './Scoreboard';
import BaseballDiamond from './BaseballDiamond';
import { syncGameState, getCurrentMarketPrices } from '@/utils/contractDecisionService';

// Convert PlayOutcome to PlayOption for UI compatibility
const convertOutcomeToOption = (outcome: PlayOutcome, index: number): PlayOption => {
  const category = outcome.outsGained > 0 ? 'out' : 'hit';
  const percentage = (outcome.probability * 100).toFixed(1);
  
  return {
    id: `outcome-${index}`,
    label: `${outcome.description} (${percentage}%)`,
    description: `${outcome.runsScored} runs, ${outcome.outsGained} outs`,
    category,
    outcome // Store the full outcome data
  } as PlayOption;
};

// Component to display base configuration preview
const BasePreview = ({ bases }: { bases: { first: boolean; second: boolean; third: boolean } }) => {
  return (
    <div className="flex items-center space-x-2 mt-1">
      <span className="text-xs text-gray-500">Bases:</span>
      <div className="relative w-10 h-10">
        <svg viewBox="0 0 50 50" className="w-full h-full">          
          {/* Third Base */}
          <rect
            x="6"
            y="19"
            width="12"
            height="12"
            fill={bases.third ? "#FFD700" : "white"}
            stroke="#000"
            strokeWidth="1.5"
            transform="rotate(45 12 25)"
          />
          
          {/* Second Base */}
          <rect
            x="19"
            y="6"
            width="12"
            height="12"
            fill={bases.second ? "#FFD700" : "white"}
            stroke="#000"
            strokeWidth="1.5"
            transform="rotate(45 25 12)"
          />
          
          {/* First Base */}
          <rect
            x="32"
            y="19"
            width="12"
            height="12"
            fill={bases.first ? "#FFD700" : "white"}
            stroke="#000"
            strokeWidth="1.5"
            transform="rotate(45 38 25)"
          />
        </svg>
      </div>
    </div>
  );
};

const getPlayOptionsByQuality = (quality: string, gameState: any): PlayOption[] => {
  // Get ALL possible outcomes from CSV data (not limited by filtered_in_play.json)
  const allOutcomes = getAllInPlayOutcomes(gameState.bases, gameState.outs);
  
  // Calculate the quality thresholds first
  const ranges = getDisplayThresholds(gameState);
  if (!ranges) return [];
  
  // Filter outcomes based on norm_value falling within the calculated range
  const filteredOutcomes = allOutcomes.filter(outcome => {
    const normValue = outcome.normValue || 0;
    
    switch (quality) {
      case 'very-bad':
        // From -1.00 to maxOutNoRun
        return normValue >= -1 && normValue <= ranges.thresholds.maxOutNoRun;
      
      case 'bad':
        // From badMin to maxOneOutNoRun
        return normValue >= ranges.thresholds.badMin && normValue <= ranges.thresholds.maxOneOutNoRun;
      
      case 'neutral':
        // From minOneOutNoRun to maxNoOutsNoRuns
        return normValue >= ranges.thresholds.minOneOutNoRun && normValue <= ranges.thresholds.maxNoOutsNoRuns;
      
      case 'good':
        // From goodMin to goodMax
        return normValue >= ranges.thresholds.goodMin && normValue <= ranges.thresholds.goodMax;
      
      case 'very-good':
        // From veryGoodMin to veryGoodMax (1.00)
        return normValue >= ranges.thresholds.veryGoodMin && normValue <= ranges.thresholds.veryGoodMax;
      
      default:
        return true;
    }
  });
  
  // Convert to PlayOption format - show more since we have more comprehensive data
  return filteredOutcomes
    .slice(0, 10) // Increased from 6 to 10 since we have more complete data
    .map((outcome, index) => convertOutcomeToOption(outcome, index));
};

// Calculate display thresholds for current base state
const getDisplayThresholds = (gameState: any) => {
  const allOutcomes = getInPlayOutcomes(gameState.bases, gameState.outs);
  const normValues = allOutcomes
    .map(o => o.normValue || 0)
    .sort((a, b) => a - b);
  
  if (normValues.length === 0) return null;
  
  // Find the highest norm_value where outs occur but no runs score
  const outcomesWithOutsButNoRuns = allOutcomes.filter(o => 
    o.outsGained > 0 && o.runsScored === 0
  );
  
  const maxOutNoRunValue = outcomesWithOutsButNoRuns.length > 0 
    ? Math.max(...outcomesWithOutsButNoRuns.map(o => o.normValue || 0))
    : -1;
  
  // Find the highest norm_value where exactly one out occurs and no runs score
  const outcomesWithOneOutNoRuns = allOutcomes.filter(o => 
    o.outsGained === 1 && o.runsScored === 0
  );
  
  let maxOneOutNoRunValue = outcomesWithOneOutNoRuns.length > 0 
    ? Math.max(...outcomesWithOneOutNoRuns.map(o => o.normValue || 0))
    : -1;
    
  const minOneOutNoRunValue = outcomesWithOneOutNoRuns.length > 0 
    ? Math.min(...outcomesWithOneOutNoRuns.map(o => o.normValue || 0))
    : -1;
  
  // Find the highest norm_value where a double play occurs
  const outcomesWithDoublePlay = allOutcomes.filter(o => 
    o.outsGained >= 2 && o.runsScored === 0
  );
  
  const maxDoublePlayValue = outcomesWithDoublePlay.length > 0 
    ? Math.max(...outcomesWithDoublePlay.map(o => o.normValue || 0))
    : null;
  
  // Find the highest norm_value where no outs occur, no runs scored, at most a double
  const outcomesNoOutsNoRuns = allOutcomes.filter(o => {
    if (o.outsGained !== 0 || o.runsScored !== 0) return false;
    
    // Exclude outcomes where batter likely reached third base
    if (!gameState.bases.third && o.finalBases.third) {
      // Third base is newly occupied
      if (!gameState.bases.second) {
        // No runner was on second to advance, so batter likely hit triple
        return false;
      }
      if (!o.finalBases.first) {
        // No runner on first in the end state, suggesting batter went to third
        return false;
      }
    }
    
    return true;
  });
  
  let maxNoOutsNoRunsValue;
  if (outcomesNoOutsNoRuns.length > 0) {
    maxNoOutsNoRunsValue = Math.max(...outcomesNoOutsNoRuns.map(o => o.normValue || 0));
  } else {
    // If no "no outs, no runs" outcomes exist, use a more flexible approach
    // Find outcomes that are neutral-ish: minimal impact plays
    const neutralCandidates = allOutcomes.filter(o => o.outsGained <= 1 && o.runsScored <= 1);
    if (neutralCandidates.length > 0) {
      // Use median of neutral candidates as upper bound
      const neutralNorms = neutralCandidates.map(o => o.normValue || 0).sort((a, b) => a - b);
      const medianIndex = Math.floor(neutralNorms.length / 2);
      maxNoOutsNoRunsValue = neutralNorms[medianIndex];
    } else {
      maxNoOutsNoRunsValue = 0.0; // Default neutral value
    }
  }
  
  const getPercentile = (p: number) => {
    const index = Math.floor((p / 100) * normValues.length);
    return normValues[Math.min(index, normValues.length - 1)];
  };
  
  // Determine bad min based on double play possibility
  let badMinValue = maxDoublePlayValue !== null 
    ? maxDoublePlayValue + 0.001
    : minOneOutNoRunValue;
  
  // Special case: when there are 2 outs, give bad range the same range as very-bad options
  if (gameState.outs === 2) {
    // Bad range should be exactly the same as very-bad: maxOutNoRun to maxOutNoRun
    // This gives bad the same options as very-bad
    badMinValue = maxOutNoRunValue;
    maxOneOutNoRunValue = maxOutNoRunValue;
  }
  

  // Calculate good range bounds - include singles where no outs occur
  const outcomesGoodCandidates = allOutcomes.filter(o => {
    // Include outcomes with runs scored and at most one out
    if (o.runsScored >= 1 && o.outsGained <= 1) return true;
    
    // Include ALL outcomes where no outs occur and could be singles
    if (o.outsGained === 0) {
      // Check for single patterns: batter reaches first base
      if (o.finalBases.first) return true;
      
      // Also include outcomes where no runs scored and no outs (conservative hits)
      if (o.runsScored === 0) return true;
    }
    
    return false;
  });
  
  let goodMinValue;
  if (outcomesGoodCandidates.length > 0) {
    goodMinValue = Math.min(...outcomesGoodCandidates.map(o => o.normValue || 0));
  } else {
    // Fallback: find the minimum value from all no-out outcomes
    const outcomesNoOuts = allOutcomes.filter(o => o.outsGained === 0);
    if (outcomesNoOuts.length > 0) {
      goodMinValue = Math.min(...outcomesNoOuts.map(o => o.normValue || 0));
    } else {
      // Ultimate fallback: use a very conservative value
      goodMinValue = -0.5;
    }
  }

  // Don't override goodMinValue - let singles be included in good range regardless of base situation

  const thresholds = {
    p25: getPercentile(25),
    p40: getPercentile(40),
    p75: getPercentile(75),
    p90: getPercentile(90),
    maxOutNoRun: maxOutNoRunValue,
    badMin: badMinValue,
    maxOneOutNoRun: maxOneOutNoRunValue,
    minOneOutNoRun: minOneOutNoRunValue,
    maxNoOutsNoRuns: maxNoOutsNoRunsValue,
    goodMin: goodMinValue,
    goodMax: (() => {
      // Calculate good max using same logic as baseballData.ts - exclude triples and home runs
      const outcomesMaxDouble = allOutcomes.filter(o => {
        // Exclude home runs: all bases cleared and high runs scored relative to initial runners
        const initialRunners = (gameState.bases.first ? 1 : 0) + (gameState.bases.second ? 1 : 0) + (gameState.bases.third ? 1 : 0);
        const finalRunners = (o.finalBases.first ? 1 : 0) + (o.finalBases.second ? 1 : 0) + (o.finalBases.third ? 1 : 0);
        
        // If all bases are cleared and we scored more runs than we had initial runners, likely a home run
        if (finalRunners === 0 && o.runsScored > initialRunners) {
          return false;
        }
        
        // Check if batter likely reached third base (triple) by comparing start vs end states
        if (!gameState.bases.third && o.finalBases.third) {
          // Third base is newly occupied
          if (!gameState.bases.second) {
            // No runner was on second to advance, so batter likely hit triple
            return false;
          }
          if (!o.finalBases.first) {
            // No runner on first in the end state, suggesting batter went to third
            return false;
          }
        }
        
        return true;
      });
      
      return outcomesMaxDouble.length > 0 
        ? Math.max(...outcomesMaxDouble.map(o => o.normValue || 0))
        : -1;
    })(),
    veryGoodMin: (() => {
      // Calculate very good min using same logic as baseballData.ts
      let veryGoodMinValue = 1; // Default if no qualifying outcomes
      let validOutcomes = [];
      
      // Debug: Let's examine all outcomes with no outs first
      const noOutOutcomes = allOutcomes.filter(o => o.outsGained === 0);
      
      for (const outcome of noOutOutcomes) {
        let isValid = false;
        let reason = "";
        
        // Option 1: Run scored with no outs
        if (outcome.runsScored >= 1) {
          isValid = true;
          reason = `Run scored (${outcome.runsScored}) with no outs`;
        }
        
        // Option 2: Batter hits a triple (no outs, ends up on third alone)
        if (!isValid && outcome.finalBases.third && !outcome.finalBases.first && !outcome.finalBases.second) {
          // Check if this could be a clean triple
          if (!gameState.bases.third) {
            // Third base wasn't occupied before
            const initialRunners = (gameState.bases.first ? 1 : 0) + (gameState.bases.second ? 1 : 0) + (gameState.bases.third ? 1 : 0);
            
            // If there were initial runners, they should have scored
            if (initialRunners === 0 || outcome.runsScored === initialRunners) {
              isValid = true;
              reason = `Clean triple (batter to third, ${initialRunners} initial runners scored)`;
            }
          }
        }
        
        if (isValid) {
          validOutcomes.push({
            outcome,
            reason,
            normValue: outcome.normValue || 0
          });
        }
      }
      
      // Find minimum norm_value from valid outcomes
      if (validOutcomes.length > 0) {
        veryGoodMinValue = Math.min(...validOutcomes.map(v => v.normValue));
        
      }
      
      
      return veryGoodMinValue;
    })(),
    veryGoodMax: 1,
    hasDoublePlay: maxDoublePlayValue !== null
  };
  
  return {
    veryBad: `-1.00 to ${thresholds.maxOutNoRun.toFixed(2)}`,
    bad: `${thresholds.badMin.toFixed(2)} to ${thresholds.maxOneOutNoRun.toFixed(2)}`,
    neutral: `${thresholds.minOneOutNoRun.toFixed(2)} to ${thresholds.maxNoOutsNoRuns.toFixed(2)}`,
    good: `${thresholds.goodMin.toFixed(2)} to ${thresholds.goodMax.toFixed(2)}`,
    veryGood: `${thresholds.veryGoodMin.toFixed(2)} to ${thresholds.veryGoodMax.toFixed(2)}`,
    thresholds
  };
};

// Get quality badge for a norm value based on current game state
const getQualityBadge = (normValue: number, gameState: any) => {
  const result = getDisplayThresholds(gameState);
  if (!result) return { color: 'bg-gray-200 text-gray-800', label: 'Unknown' };
  
  const { thresholds } = result;
  
  // Very Good: within very good range
  if (normValue >= thresholds.veryGoodMin && normValue <= thresholds.veryGoodMax) return { color: 'bg-green-200 text-green-800', label: 'Excellent' };
  
  // Good: within good range
  if (normValue >= thresholds.goodMin && normValue <= thresholds.goodMax) return { color: 'bg-blue-200 text-blue-800', label: 'Good' };
  
  // Neutral: lowest single out with no runs to highest no-outs, no-runs outcome
  if (normValue >= thresholds.minOneOutNoRun && normValue <= thresholds.maxNoOutsNoRuns) return { color: 'bg-yellow-200 text-yellow-800', label: 'Average' };
  
  // Bad: conditional range based on double play possibility
  if (normValue >= thresholds.badMin && normValue <= thresholds.maxOneOutNoRun) return { color: 'bg-orange-200 text-orange-800', label: 'Poor' };
  
  // Very Bad: -1 to highest out with no runs
  if (normValue >= -1 && normValue <= thresholds.maxOutNoRun) return { color: 'bg-red-200 text-red-800', label: 'Very Poor' };
  
  return { color: 'bg-gray-200 text-gray-800', label: 'Unknown' };
};

// Get base path options by quality (returns all outcomes, not filtered by quality selection)
const getBasePathOptionsByQuality = (quality: string, gameState: any): PlayOption[] => {
  // Get all possible base path outcomes from CSV data
  const allOutcomes = getBasePathOutcomes(gameState.bases, gameState.outs);
  
  // Don't filter by quality - return all outcomes regardless of quality selection
  // But apply custom sorting based on quality selection for display order
  let sortedOutcomes;
  if (quality === 'good') {
    // For good: show norm_value > 0 first (sorted by frequency), then norm_value <= 0 (sorted by frequency)
    const positive = allOutcomes.filter(o => (o.normValue || 0) > 0).sort((a, b) => b.probability - a.probability);
    const nonPositive = allOutcomes.filter(o => (o.normValue || 0) <= 0).sort((a, b) => b.probability - a.probability);
    sortedOutcomes = [...positive, ...nonPositive];
  } else if (quality === 'bad') {
    // For bad: show norm_value < 0 first (sorted by frequency), then norm_value >= 0 (sorted by frequency)
    const negative = allOutcomes.filter(o => (o.normValue || 0) < 0).sort((a, b) => b.probability - a.probability);
    const nonNegative = allOutcomes.filter(o => (o.normValue || 0) >= 0).sort((a, b) => b.probability - a.probability);
    sortedOutcomes = [...negative, ...nonNegative];
  } else {
    // For neutral and other qualities: sort by frequency only
    sortedOutcomes = allOutcomes.sort((a, b) => b.probability - a.probability);
  }
  
  // Convert to PlayOption format and limit to top 6 most likely
  return sortedOutcomes
    .slice(0, 6)
    .map((outcome, index) => convertOutcomeToOption(outcome, index));
};

export default function GameControls() {
  const { gameState, dispatch, canUndo } = useGameState();
  const [showPlayModal, setShowPlayModal] = useState(false);
  const [showStealModal, setShowStealModal] = useState(false);
  const [showGameStateEditor, setShowGameStateEditor] = useState(false);
  const [playQuality, setPlayQuality] = useState('neutral');
  const [basePathQuality, setBasePathQuality] = useState('neutral');
  const [marketPrices, setMarketPrices] = useState<{
    home: number;
    away: number;
  } | null>(null);


  const handleStrike = () => {
    setCurrentPlayContext({ actionType: 'STRIKE' });
    dispatch({ type: 'STRIKE' });
  };
  
  const handleBall = () => {
    setCurrentPlayContext({ actionType: 'BALL' });
    dispatch({ type: 'BALL' });
  };
  
  const handleFoul = () => {
    setCurrentPlayContext({ actionType: 'FOUL' });
    dispatch({ type: 'FOUL' });
  };
  
  const handleUndo = () => {
    setCurrentPlayContext({ actionType: 'UNDO' });
    dispatch({ type: 'UNDO' });
  };

  // State to track current play context
  const [currentPlayContext, setCurrentPlayContext] = useState<{
    quality?: string;
    actionType?: string;
  }>({});

  // Sync game state to backend and fetch prices whenever it changes
  React.useEffect(() => {
    const syncStateAndFetchPrices = async () => {
      // Generate gameId for price fetching
      const gameId = `${gameState.homeTeam}_${gameState.awayTeam}`;
      
      // Sync game state and fetch prices in parallel
      const [syncResult, pricesResult] = await Promise.all([
        syncGameState(gameState, currentPlayContext.quality, currentPlayContext.actionType),
        getCurrentMarketPrices(gameId)
      ]);
      
      if (pricesResult.success && pricesResult.prices) {
        console.log('💰 Updated market prices:', pricesResult.prices);
        setMarketPrices(pricesResult.prices);
      } else {
        console.warn('⚠️ Failed to fetch market prices:', pricesResult.error);
      }
    };
    
    syncStateAndFetchPrices();
  }, [gameState, currentPlayContext]);

  // All backend communication functions removed

  // No automatic balance loading - will be manual only

  // All automatic backend communication removed - will be manual only

  const handleGameStateSave = (newGameState: GameState) => {
    // Manual game state changes should not trigger betting analysis
    dispatch({ type: 'SET_GAME_STATE', gameState: newGameState, source: 'manual_edit' });
    setShowGameStateEditor(false);
  };

  const handleGameStateCancel = () => {
    setShowGameStateEditor(false);
  };

  const handlePlaySelect = (play: PlayOption) => {
    setShowPlayModal(false);
    
    // Set play context with quality information
    setCurrentPlayContext({ 
      actionType: 'IN_PLAY', 
      quality: playQuality 
    });
    
    // Use Retrosheet outcome data if available
    if (play.outcome) {
      // Apply all outcome effects in a single action for proper undo
      dispatch({ type: 'APPLY_PLAY_OUTCOME', outcome: play.outcome });
      return;
    }
    
    // Fallback for old action type
    dispatch({ type: 'HIT_IN_PLAY', outcome: play.id });
    
    // Fallback to old logic for non-Retrosheet outcomes
    switch (play.id) {
      // Basic hits
      case 'single':
        // Advance all runners one base, batter to first
        if (gameState.bases.third) {
          dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        }
        dispatch({ type: 'SET_BASE', base: 'third', occupied: gameState.bases.second });
        dispatch({ type: 'SET_BASE', base: 'second', occupied: gameState.bases.first });
        dispatch({ type: 'SET_BASE', base: 'first', occupied: true });
        dispatch({ type: 'RESET_COUNT' });
        break;
      case 'double':
        // Score runners from 2nd and 3rd, advance 1st to 3rd, batter to 2nd
        if (gameState.bases.second) {
          dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        }
        if (gameState.bases.third) {
          dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        }
        dispatch({ type: 'SET_BASE', base: 'third', occupied: gameState.bases.first });
        dispatch({ type: 'SET_BASE', base: 'second', occupied: true });
        dispatch({ type: 'SET_BASE', base: 'first', occupied: false });
        dispatch({ type: 'RESET_COUNT' });
        break;
      case 'triple':
        // Score all runners, batter to third
        if (gameState.bases.first) dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        if (gameState.bases.second) dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        if (gameState.bases.third) dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        dispatch({ type: 'CLEAR_BASES' });
        dispatch({ type: 'SET_BASE', base: 'third', occupied: true });
        dispatch({ type: 'RESET_COUNT' });
        break;
      case 'homerun':
        // Score all runners plus batter
        if (gameState.bases.first) dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        if (gameState.bases.second) dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        if (gameState.bases.third) dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        dispatch({ type: 'CLEAR_BASES' });
        dispatch({ type: 'RESET_COUNT' });
        break;
      // New context-aware outcomes
      case 'single-empty':
      case 'single-conservative':
      case 'single-good':
        // Standard single logic
        if (gameState.bases.third) {
          dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        }
        dispatch({ type: 'SET_BASE', base: 'third', occupied: gameState.bases.second });
        dispatch({ type: 'SET_BASE', base: 'second', occupied: gameState.bases.first });
        dispatch({ type: 'SET_BASE', base: 'first', occupied: true });
        dispatch({ type: 'RESET_COUNT' });
        break;

      case 'single-aggressive':
        // Aggressive single - extra base advancement
        if (gameState.bases.third) {
          dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        }
        if (gameState.bases.second) {
          dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        }
        dispatch({ type: 'SET_BASE', base: 'third', occupied: gameState.bases.first });
        dispatch({ type: 'SET_BASE', base: 'second', occupied: false });
        dispatch({ type: 'SET_BASE', base: 'first', occupied: true });
        dispatch({ type: 'RESET_COUNT' });
        break;

      case 'double-good':
      case 'double-excellent':
        // Standard double logic
        if (gameState.bases.second) {
          dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        }
        if (gameState.bases.third) {
          dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        }
        dispatch({ type: 'SET_BASE', base: 'third', occupied: gameState.bases.first });
        dispatch({ type: 'SET_BASE', base: 'second', occupied: true });
        dispatch({ type: 'SET_BASE', base: 'first', occupied: false });
        dispatch({ type: 'RESET_COUNT' });
        break;

      case 'triple-excellent':
        // Score all runners, batter to third
        if (gameState.bases.first) dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        if (gameState.bases.second) dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        if (gameState.bases.third) dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        dispatch({ type: 'CLEAR_BASES' });
        dispatch({ type: 'SET_BASE', base: 'third', occupied: true });
        dispatch({ type: 'RESET_COUNT' });
        break;

      case 'homerun-grand':
        // Score all runners plus batter
        if (gameState.bases.first) dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        if (gameState.bases.second) dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        if (gameState.bases.third) dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        dispatch({ type: 'CLEAR_BASES' });
        dispatch({ type: 'RESET_COUNT' });
        break;

      case 'walk':
        dispatch({ type: 'BALL' }); // This will trigger walk logic
        break;
      
      case 'fieldout':
      case 'flyout':
      case 'groundout':
        dispatch({ type: 'ADD_OUT' });
        break;

      case 'infield-hit':
        // Batter safe, runners hold
        dispatch({ type: 'SET_BASE', base: 'first', occupied: true });
        dispatch({ type: 'RESET_COUNT' });
        break;

      case 'error':
        // All runners advance, batter safe
        if (gameState.bases.third) {
          dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        }
        dispatch({ type: 'SET_BASE', base: 'third', occupied: gameState.bases.second });
        dispatch({ type: 'SET_BASE', base: 'second', occupied: gameState.bases.first });
        dispatch({ type: 'SET_BASE', base: 'first', occupied: true });
        dispatch({ type: 'RESET_COUNT' });
        break;

      case 'sacrifice-fly':
        if (gameState.bases.third) {
          dispatch({ type: 'SET_BASE', base: 'third', occupied: false });
          dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        }
        dispatch({ type: 'ADD_OUT' });
        break;

      case 'fielders-choice-out':
        // Lead runner out, batter safe
        if (gameState.bases.first && gameState.bases.second) {
          dispatch({ type: 'SET_BASE', base: 'second', occupied: false });
        } else if (gameState.bases.first) {
          dispatch({ type: 'SET_BASE', base: 'first', occupied: true });
        }
        dispatch({ type: 'SET_BASE', base: 'first', occupied: true });
        dispatch({ type: 'ADD_OUT' });
        break;

      case 'strikeout':
        dispatch({ type: 'ADD_OUT' });
        break;

      case 'flyout':
      case 'groundout':
      case 'popup':
        dispatch({ type: 'ADD_OUT' });
        break;

      case 'double-play':
        dispatch({ type: 'ADD_OUT' });
        dispatch({ type: 'ADD_OUT' });
        if (gameState.bases.first) {
          dispatch({ type: 'SET_BASE', base: 'first', occupied: false });
        }
        break;

      case 'sacrifice-fly':
        if (gameState.bases.third) {
          dispatch({ type: 'SET_BASE', base: 'third', occupied: false });
          dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
        }
        dispatch({ type: 'ADD_OUT' });
        break;
    }
  };

  const handleStealSelect = (steal: StealOption) => {
    setShowStealModal(false);
    
    // Set play context for base path actions
    setCurrentPlayContext({ 
      actionType: 'BASE_PATH', 
      quality: basePathQuality 
    });
    
    // Use Retrosheet outcome data if available
    if (steal.outcome) {
      // Apply all outcome effects in a single action for proper undo
      dispatch({ type: 'APPLY_BASE_PATH_OUTCOME', outcome: steal.outcome });
      return;
    }
    
    // Fallback for old action type
    dispatch({ type: 'STOLEN_BASE', from: steal.from, to: steal.to });
    
    // Fallback to old logic for non-Retrosheet outcomes
    if (steal.id.includes('caught')) {
      dispatch({ type: 'ADD_OUT' });
      dispatch({ type: 'SET_BASE', base: steal.from, occupied: false });
    } else {
      dispatch({ type: 'SET_BASE', base: steal.from, occupied: false });
      if (steal.to === 'home') {
        dispatch({ type: 'SCORE_RUN', team: gameState.isTopOfInning ? 'away' : 'home' });
      } else {
        dispatch({ type: 'SET_BASE', base: steal.to, occupied: true });
      }
    }
  };

  const hasRunnersOnBase = gameState.bases.first || gameState.bases.second || gameState.bases.third;

  return (
    <div className="space-y-4">
      {/* Control buttons - positioned above scoreboard */}
      <div className="flex justify-end gap-2 mb-2">
        {/* Game State Editor Button */}
        <button
          onClick={() => setShowGameStateEditor(true)}
          className="w-8 h-8 rounded-md shadow-md transition-all flex items-center justify-center text-sm bg-blue-600 hover:bg-blue-700 text-white active:scale-95"
          title="Edit game state"
        >
          ⚙
        </button>
        
        {/* Predictive Analysis Button removed */}

        {/* Undo Button */}
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className={`w-8 h-8 rounded-md shadow-md transition-all flex items-center justify-center text-sm ${
            canUndo
              ? 'bg-orange-600 hover:bg-orange-700 text-white active:scale-95'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
          title="Undo last action"
        >
          ↶
        </button>
      </div>

      {/* Scoreboard */}
      <Scoreboard />

      {/* Market Prices Display */}
      {marketPrices && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
          <div className="font-medium text-blue-800 mb-2">Live Market Prices</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-xs text-gray-600">{gameState.homeTeam} (Home)</div>
              <div className="text-lg font-bold text-blue-900">${marketPrices.home.toFixed(3)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-600">{gameState.awayTeam} (Away)</div>
              <div className="text-lg font-bold text-blue-900">${marketPrices.away.toFixed(3)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Baseball Diamond */}
      <BaseballDiamond />

      {/* Strike/Ball/Foul Controls */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={handleStrike}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-6 px-4 rounded-lg text-xl shadow-lg active:scale-95 transition-transform"
        >
          STRIKE
        </button>
        <button
          onClick={handleBall}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 px-4 rounded-lg text-xl shadow-lg active:scale-95 transition-transform"
        >
          BALL
        </button>
        <button
          onClick={handleFoul}
          className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-6 px-4 rounded-lg text-xl shadow-lg active:scale-95 transition-transform"
        >
          FOUL
        </button>
      </div>

      {/* In-Play and Base Path Controls */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            setPlayQuality('neutral');
            setShowPlayModal(true);
            // Capture price snapshot when IN PLAY button is pressed
            setCurrentPlayContext({
              quality: undefined,
              actionType: 'IN_PLAY_PRESSED'
            });
          }}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-6 px-4 rounded-lg text-xl shadow-lg active:scale-95 transition-transform"
        >
          IN PLAY
        </button>
        <button
          onClick={() => {
            setBasePathQuality('neutral');
            setShowStealModal(true);
          }}
          disabled={!hasRunnersOnBase}
          className={`font-bold py-6 px-4 rounded-lg text-xl shadow-lg active:scale-95 transition-transform ${
            hasRunnersOnBase
              ? 'bg-purple-600 hover:bg-purple-700 text-white'
              : 'bg-gray-400 text-gray-600 cursor-not-allowed'
          }`}
        >
          BASE PATH
        </button>
      </div>


      {/* Play Options Modal */}
      {showPlayModal && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800">Play Outcome</h2>
              <button
                onClick={() => setShowPlayModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
          </div>

          {/* Play Options */}
          <div className="flex-1 p-4 overflow-y-auto">
            {/* Foul Ball Button */}
            <div className="mb-4">
              <button
                onClick={() => {
                  setShowPlayModal(false);
                  handleFoul();
                }}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-4 px-4 rounded-lg text-lg shadow-lg active:scale-95 transition-transform"
              >
                FOUL BALL
              </button>
            </div>
            
            <div className="space-y-3">
              {getPlayOptionsByQuality(playQuality, gameState).map((play) => (
                <button
                  key={play.id}
                  onClick={() => handlePlaySelect(play)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors text-lg ${
                    play.category === 'hit' ? 'border-green-300 bg-green-50 hover:bg-green-100' :
                    play.category === 'out' ? 'border-red-300 bg-red-50 hover:bg-red-100' :
                    'border-yellow-300 bg-yellow-50 hover:bg-yellow-100'
                  }`}
                >
                  <div className="font-bold text-gray-800">{play.label}</div>
                  <div className="text-sm text-gray-600 mt-1">{play.description}</div>
                  {play.outcome && (
                    <>
                      <BasePreview bases={play.outcome.finalBases} />
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-xs text-gray-500">
                          Value: {play.outcome.normValue?.toFixed(3) || 'N/A'}
                        </div>
                        {(() => {
                          const badge = getQualityBadge(play.outcome.normValue || 0, gameState);
                          return (
                            <div className={`text-xs px-2 py-1 rounded ${badge.color}`}>
                              {badge.label}
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Quality Selector */}
          <div className="p-4 border-t border-gray-200">
            <div className="mb-3 text-xs text-gray-600">
              <div className="font-medium mb-1">Quality Ranges (norm_value for this situation):</div>
              {(() => {
                const ranges = getDisplayThresholds(gameState);
                if (!ranges) return <div>No data available</div>;
                return (
                  <div className="grid grid-cols-5 gap-1 text-center">
                    <div>{ranges.veryBad}</div>
                    <div>{ranges.bad}</div>
                    <div>{ranges.neutral}</div>
                    <div>{ranges.good}</div>
                    <div>{ranges.veryGood}</div>
                  </div>
                );
              })()}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[
                { key: 'very-bad', label: 'Very Bad', color: 'bg-red-600' },
                { key: 'bad', label: 'Bad', color: 'bg-red-400' },
                { key: 'neutral', label: 'Neutral', color: 'bg-gray-400' },
                { key: 'good', label: 'Good', color: 'bg-green-400' },
                { key: 'very-good', label: 'Very Good', color: 'bg-green-600' },
              ].map((quality) => (
                <button
                  key={quality.key}
                  onClick={() => {
                    setPlayQuality(quality.key);
                    // Immediately sync quality change to backend
                    setCurrentPlayContext({ 
                      actionType: 'QUALITY_CHANGE', 
                      quality: quality.key 
                    });
                  }}
                  className={`py-3 px-2 rounded-lg text-white font-medium text-sm transition-all ${
                    playQuality === quality.key 
                      ? `${quality.color} ring-4 ring-blue-300` 
                      : `${quality.color} opacity-60 hover:opacity-80`
                  }`}
                >
                  {quality.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Base Path Options Modal */}
      {showStealModal && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800">Base Path Action</h2>
              <button
                onClick={() => setShowStealModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
          </div>

          {/* Base Path Options */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="space-y-3">
              {getBasePathOptionsByQuality(basePathQuality, gameState).map((option) => (
                <button
                  key={option.id}
                  onClick={() => handlePlaySelect(option)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors text-lg ${
                    option.category === 'hit' ? 'border-green-300 bg-green-50 hover:bg-green-100' :
                    option.category === 'out' ? 'border-red-300 bg-red-50 hover:bg-red-100' :
                    'border-yellow-300 bg-yellow-50 hover:bg-yellow-100'
                  }`}
                >
                  <div className="font-bold text-gray-800">{option.label}</div>
                  <div className="text-sm text-gray-600 mt-1">{option.description}</div>
                  {option.outcome && (
                    <>
                      <BasePreview bases={option.outcome.finalBases} />
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-xs text-gray-500">
                          Value: {option.outcome.normValue?.toFixed(3) || 'N/A'}
                        </div>
                        {(() => {
                          const badge = getQualityBadge(option.outcome.normValue || 0, gameState);
                          return (
                            <div className={`text-xs px-2 py-1 rounded ${badge.color}`}>
                              {badge.label}
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Quality Selector - only Bad, Neutral, Good */}
          <div className="p-4 border-t border-gray-200">
            <div className="mb-3 text-xs text-gray-600">
              <div className="font-medium mb-1">Quality Ranges (norm_value for this situation):</div>
              {(() => {
                const ranges = getDisplayThresholds(gameState);
                if (!ranges) return <div>No data available</div>;
                return (
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>{ranges.bad}</div>
                    <div>{ranges.neutral}</div>
                    <div>{ranges.good}</div>
                  </div>
                );
              })()}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'bad', label: 'Bad', color: 'bg-red-400' },
                { key: 'neutral', label: 'Neutral', color: 'bg-gray-400' },
                { key: 'good', label: 'Good', color: 'bg-green-400' },
              ].map((quality) => (
                <button
                  key={quality.key}
                  onClick={() => {
                    setBasePathQuality(quality.key);
                    // Immediately sync quality change to backend
                    setCurrentPlayContext({ 
                      actionType: 'BASE_PATH_QUALITY_CHANGE', 
                      quality: quality.key 
                    });
                  }}
                  className={`py-3 px-2 rounded-lg text-white font-medium text-sm transition-all ${
                    basePathQuality === quality.key 
                      ? `${quality.color} ring-4 ring-blue-300` 
                      : `${quality.color} opacity-60 hover:opacity-80`
                  }`}
                >
                  {quality.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Game State Editor Modal */}
      {showGameStateEditor && (
        <GameStateEditor
          gameState={gameState}
          onSave={handleGameStateSave}
          onCancel={handleGameStateCancel}
        />
      )}
    </div>
  );
}