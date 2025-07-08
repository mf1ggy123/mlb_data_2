import inPlayData from '../filtered_in_play.json';
import baseMovementData from '../filtered_base_movement.json';

export interface BaseState {
  first: boolean;
  second: boolean;
  third: boolean;
}

export interface PlayOutcome {
  finalBases: BaseState;
  runsScored: number;
  outsGained: number;
  probability: number;
  description: string;
  normValue?: number;
}

interface TransitionValue {
  startBase: string;
  endBase: string;
  runsScored: number;
  outs: number;
  normValue: number;
}

import { getTransitionValue, TRANSITION_VALUES } from './transitionValues';
import { getBaseMovementValue } from './baseMovementValues';

// Get actual norm_value from transition data
function getNormValueForOutcome(
  startBases: BaseState,
  finalBases: BaseState,
  runsScored: number,
  outsGained: number,
  currentOuts: number = 0
): number {
  const actualValue = getTransitionValue(
    startBases,
    finalBases,
    runsScored,
    outsGained,
    currentOuts
  );
  
  if (actualValue !== null) {
    return actualValue;
  }
  
  // Fallback for missing data
  if (runsScored >= 2 && outsGained === 0) return 0.6;
  if (runsScored === 1 && outsGained === 0) return 0.4;
  if (runsScored === 0 && outsGained === 0) return 0.2;
  if (runsScored === 0 && outsGained === 1) return -0.1;
  if (runsScored === 0 && outsGained >= 2) return -0.8;
  
  return 0;
}

// Convert base state to string format used in JSON files
export function baseStateToString(bases: BaseState): string {
  const first = bases.first ? 1 : 0;
  const second = bases.second ? 1 : 0;
  const third = bases.third ? 1 : 0;
  return `(${first}, ${second}, ${third})`;
}

// Convert string format back to base state
export function stringToBaseState(str: string): BaseState {
  const match = str.match(/\((\d), (\d), (\d)\)/);
  if (!match) throw new Error(`Invalid base state string: ${str}`);
  
  return {
    first: match[1] === '1',
    second: match[2] === '1',
    third: match[3] === '1'
  };
}

// Parse outcome string like "((1,0,0), 1, 0)" into components
export function parseOutcome(outcomeStr: string): {
  finalBases: BaseState;
  runsScored: number;
  outsGained: number;
} {
  const match = outcomeStr.match(/\(\((\d), (\d), (\d)\), (\d+), (\d+)\)/);
  if (!match) throw new Error(`Invalid outcome string: ${outcomeStr}`);
  
  return {
    finalBases: {
      first: match[1] === '1',
      second: match[2] === '1',
      third: match[3] === '1'
    },
    runsScored: parseInt(match[4]),
    outsGained: parseInt(match[5])
  };
}

// Generate description for an outcome
export function generateOutcomeDescription(
  initialBases: BaseState,
  finalBases: BaseState,
  runsScored: number,
  outsGained: number
): string {
  const descriptions = [];
  
  // Describe runs scored
  if (runsScored > 0) {
    descriptions.push(`${runsScored} run${runsScored > 1 ? 's' : ''} score`);
  }
  
  // Describe outs
  if (outsGained > 0) {
    descriptions.push(`${outsGained} out${outsGained > 1 ? 's' : ''}`);
  }
  
  // Describe base advancement
  const initialRunners = [initialBases.first, initialBases.second, initialBases.third].filter(Boolean).length;
  const finalRunners = [finalBases.first, finalBases.second, finalBases.third].filter(Boolean).length;
  
  if (finalRunners > initialRunners) {
    descriptions.push('batter reaches base');
  } else if (finalRunners < initialRunners && runsScored === 0) {
    descriptions.push('runners caught stealing/picked off');
  }
  
  return descriptions.join(', ') || 'no change';
}

// Get weighted random outcome based on probabilities
export function getRandomOutcome(outcomes: PlayOutcome[]): PlayOutcome {
  const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  const random = Math.random() * totalWeight;
  
  let currentWeight = 0;
  for (const outcome of outcomes) {
    currentWeight += outcome.probability;
    if (random <= currentWeight) {
      return outcome;
    }
  }
  
  return outcomes[outcomes.length - 1]; // fallback
}

// Get all possible in-play outcomes for a given base state
export function getInPlayOutcomes(bases: BaseState, currentOuts: number = 0): PlayOutcome[] {
  const baseStateStr = baseStateToString(bases);
  const outcomes: PlayOutcome[] = [];
  
  const stateData = (inPlayData as any)[baseStateStr];
  if (!stateData) return outcomes;
  
  // Convert raw counts to probabilities
  const totalCount = Object.values(stateData).reduce((sum: number, count: any) => sum + count, 0);
  
  for (const [outcomeStr, count] of Object.entries(stateData)) {
    const { finalBases, runsScored, outsGained } = parseOutcome(outcomeStr);
    const probability = (count as number) / totalCount;
    const normValue = getNormValueForOutcome(bases, finalBases, runsScored, outsGained, currentOuts);
    
    outcomes.push({
      finalBases,
      runsScored,
      outsGained,
      probability,
      description: generateOutcomeDescription(bases, finalBases, runsScored, outsGained),
      normValue
    });
  }
  
  // Sort by probability (highest first)
  return outcomes.sort((a, b) => b.probability - a.probability);
}

// Get ALL possible in-play outcomes from CSV data with probabilities from filtered_in_play.json
export function getAllInPlayOutcomes(bases: BaseState, currentOuts: number = 0): PlayOutcome[] {
  const baseStateStr = baseStateToString(bases);
  const outcomes: PlayOutcome[] = [];
  
  // Get probability data from filtered_in_play.json
  const stateData = (inPlayData as any)[baseStateStr];
  const probabilityMap = new Map<string, number>();
  let totalCount = 0;
  
  if (stateData) {
    totalCount = Object.values(stateData).reduce((sum: number, count: any) => sum + count, 0);
    
    for (const [outcomeStr, count] of Object.entries(stateData)) {
      const probability = (count as number) / totalCount;
      probabilityMap.set(outcomeStr, probability);
    }
  }
  
  // Parse all transition values to find outcomes that start from our base state
  for (const [key, normValue] of Object.entries(TRANSITION_VALUES)) {
    const parts = key.split('_');
    if (parts.length === 5) {
      const startBase = parts[0];
      const endBase = parts[1];
      const runsScored = parseInt(parts[2]);
      const outsGained = parseInt(parts[3]);
      const startOuts = parseInt(parts[4]);
      
      // Only include outcomes that start from our current base state and outs
      if (startBase === baseStateStr && startOuts === currentOuts) {
        try {
          const finalBases = stringToBaseState(endBase);
          
          // Create outcome string to match filtered_in_play.json format
          const outcomeStr = `((${finalBases.first ? 1 : 0}, ${finalBases.second ? 1 : 0}, ${finalBases.third ? 1 : 0}), ${runsScored}, ${outsGained})`;
          
          // Get probability from filtered_in_play.json or use small default
          const probability = probabilityMap.get(outcomeStr) || 0.001; // Very small default for outcomes not in filtered data
          
          outcomes.push({
            finalBases,
            runsScored,
            outsGained,
            probability,
            description: generateOutcomeDescription(bases, finalBases, runsScored, outsGained),
            normValue
          });
        } catch (error) {
          // Skip invalid base state strings
          continue;
        }
      }
    }
  }
  
  // Sort by probability (highest first) now that we have real probabilities
  return outcomes.sort((a, b) => b.probability - a.probability);
}

// Get actual norm_value for base movement outcome
function getBaseMovementNormValue(
  startBases: BaseState,
  finalBases: BaseState,
  runsScored: number,
  outsGained: number,
  currentOuts: number = 0
): number {
  const actualValue = getBaseMovementValue(
    startBases,
    finalBases,
    runsScored,
    outsGained,
    currentOuts
  );
  
  if (actualValue !== null) {
    return actualValue;
  }
  
  // Fallback for missing data
  if (runsScored >= 1 && outsGained === 0) return 0.5;
  if (runsScored === 0 && outsGained === 0) return 0.2;
  if (runsScored === 0 && outsGained === 1) return -0.3;
  if (runsScored === 0 && outsGained >= 2) return -0.8;
  
  return 0;
}

// Get all possible base-path outcomes for a given base state
export function getBasePathOutcomes(bases: BaseState, currentOuts: number = 0): PlayOutcome[] {
  const baseStateStr = baseStateToString(bases);
  const outcomes: PlayOutcome[] = [];
  
  const stateData = (baseMovementData as any)[baseStateStr];
  if (!stateData) return outcomes;
  
  // Convert raw counts to probabilities
  const totalCount = Object.values(stateData).reduce((sum: number, count: any) => sum + count, 0);
  
  for (const [outcomeStr, count] of Object.entries(stateData)) {
    const { finalBases, runsScored, outsGained } = parseOutcome(outcomeStr);
    const probability = (count as number) / totalCount;
    const normValue = getBaseMovementNormValue(bases, finalBases, runsScored, outsGained, currentOuts);
    
    outcomes.push({
      finalBases,
      runsScored,
      outsGained,
      probability,
      description: generateOutcomeDescription(bases, finalBases, runsScored, outsGained),
      normValue
    });
  }
  
  // Sort by probability (highest first)
  return outcomes.sort((a, b) => b.probability - a.probability);
}

// Filter base path outcomes by quality (bad, neutral, good only)
export function filterBasePathOutcomesByQuality(outcomes: PlayOutcome[], quality: string, startBases?: BaseState): PlayOutcome[] {
  const thresholds = calculateQualityThresholds(outcomes, startBases);
  
  return outcomes.filter(outcome => {
    const normValue = outcome.normValue || 0;
    
    switch (quality) {
      case 'bad':
        // From lowest to highest single out with no runs
        return normValue >= thresholds.badMin && normValue <= thresholds.badMax;
      
      case 'neutral':
        return normValue >= thresholds.neutralMin && normValue <= thresholds.neutralMax;
      
      case 'good':
        return normValue >= thresholds.goodMin && normValue <= thresholds.goodMax;
      
      default:
        return true;
    }
  });
}

interface QualityThresholds {
  veryBadMax: number;
  badMin: number;
  badMax: number;
  neutralMin: number;
  neutralMax: number;
  goodMin: number;
  goodMax: number;
  veryGoodMin: number;
  veryGoodMax: number;
}

// Calculate quality thresholds for a specific base state using outcome-based logic
function calculateQualityThresholds(outcomes: PlayOutcome[], startBases?: BaseState): QualityThresholds {
  const normValues = outcomes
    .map(o => o.normValue || 0)
    .sort((a, b) => a - b);
  
  if (normValues.length === 0) {
    // Fallback if no data
    return {
      veryBadMax: -0.6,
      badMin: -0.4,
      badMax: 0.2,
      neutralMin: -0.4,
      neutralMax: 0.6,
      goodMin: 0.2,
      goodMax: 0.6,
      veryGoodMin: 0.7,
      veryGoodMax: 1.0
    };
  }
  
  // Find the highest norm_value where outs occur but no runs score (for very bad)
  const outcomesWithOutsButNoRuns = outcomes.filter(o => 
    o.outsGained > 0 && o.runsScored === 0
  );
  
  const maxOutNoRunValue = outcomesWithOutsButNoRuns.length > 0 
    ? Math.max(...outcomesWithOutsButNoRuns.map(o => o.normValue || 0))
    : -1; // Default to -1 if no such outcomes exist
  
  // Find the min and max norm_values where exactly one out occurs and no runs score (for bad)
  const outcomesWithOneOutNoRuns = outcomes.filter(o => 
    o.outsGained === 1 && o.runsScored === 0
  );
  
  const maxOneOutNoRunValue = outcomesWithOneOutNoRuns.length > 0 
    ? Math.max(...outcomesWithOneOutNoRuns.map(o => o.normValue || 0))
    : -1;
    
  const minOneOutNoRunValue = outcomesWithOneOutNoRuns.length > 0 
    ? Math.min(...outcomesWithOneOutNoRuns.map(o => o.normValue || 0))
    : -1;
  
  // Find the highest norm_value where a double play occurs (for bad range threshold)
  const outcomesWithDoublePlay = outcomes.filter(o => 
    o.outsGained >= 2 && o.runsScored === 0
  );
  
  const maxDoublePlayValue = outcomesWithDoublePlay.length > 0 
    ? Math.max(...outcomesWithDoublePlay.map(o => o.normValue || 0))
    : null; // null means no double plays possible
  
  // Find the highest norm_value where no outs occur, no runs scored, at most a double
  // This means advancement without scoring, but batter doesn't reach third base
  const outcomesNoOutsNoRunsMaxDouble = outcomes.filter(o => {
    if (o.outsGained !== 0 || o.runsScored !== 0) return false;
    
    if (!startBases) {
      // Fallback: exclude patterns that look like triples
      if (o.finalBases.third && !o.finalBases.first && !o.finalBases.second) {
        return false; // Likely a triple from empty bases
      }
      return true;
    }
    
    // Check if batter likely reached third base by comparing start vs end states
    // If third base was empty and is now occupied, and we can't account for it
    // by runner advancement from second, then the batter probably hit a triple
    
    if (!startBases.third && o.finalBases.third) {
      // Third base is newly occupied
      if (!startBases.second) {
        // No runner was on second to advance, so batter likely hit triple
        return false;
      }
      // If there was a runner on second, they could have advanced to third
      // In this case, we need to check if there's still a runner on first (the batter)
      // vs if the batter advanced to third
      if (!o.finalBases.first) {
        // No runner on first in the end state, suggesting batter went to third
        return false;
      }
    }
    
    return true;
  });
  
  const maxNoOutsNoRunsValue = outcomesNoOutsNoRunsMaxDouble.length > 0 
    ? Math.max(...outcomesNoOutsNoRunsMaxDouble.map(o => o.normValue || 0))
    : -1;
  
  // Find the lowest norm_value for good range lower bound
  // Priority 1: At least 1 run scored, at most 1 out
  const outcomesRunsMaxOneOut = outcomes.filter(o => 
    o.runsScored >= 1 && o.outsGained <= 1
  );
  
  let goodMinValue;
  if (outcomesRunsMaxOneOut.length > 0) {
    goodMinValue = Math.min(...outcomesRunsMaxOneOut.map(o => o.normValue || 0));
  } else {
    // Fallback: lowest norm_value where no outs occur
    const outcomesNoOuts = outcomes.filter(o => o.outsGained === 0);
    goodMinValue = outcomesNoOuts.length > 0 
      ? Math.min(...outcomesNoOuts.map(o => o.normValue || 0))
      : -1;
  }
  
  // Find the best norm_value where batter hits at most a double (excludes triples and home runs)
  const outcomesMaxDouble = outcomes.filter(o => {
    // Exclude home runs: all bases cleared and high runs scored relative to initial runners
    const initialRunners = (startBases?.first ? 1 : 0) + (startBases?.second ? 1 : 0) + (startBases?.third ? 1 : 0);
    const finalRunners = (o.finalBases.first ? 1 : 0) + (o.finalBases.second ? 1 : 0) + (o.finalBases.third ? 1 : 0);
    
    // If all bases are cleared and we scored more runs than we had initial runners, likely a home run
    if (finalRunners === 0 && o.runsScored > initialRunners) {
      return false;
    }
    
    if (!startBases) {
      // Fallback: exclude patterns that look like triples or home runs
      if (o.finalBases.third && !o.finalBases.first && !o.finalBases.second) {
        return false; // Likely a triple from empty bases
      }
      if (finalRunners === 0 && o.runsScored > 0) {
        return false; // Likely a home run from empty bases
      }
      return true;
    }
    
    // Check if batter likely reached third base (triple) by comparing start vs end states
    if (!startBases.third && o.finalBases.third) {
      // Third base is newly occupied
      if (!startBases.second) {
        // No runner was on second to advance, so batter likely hit triple
        return false;
      }
      // If there was a runner on second, they could have advanced to third
      // In this case, we need to check if there's still a runner on first (the batter)
      // vs if the batter advanced to third
      if (!o.finalBases.first) {
        // No runner on first in the end state, suggesting batter went to third
        return false;
      }
    }
    
    return true;
  });
  
  const goodMaxValue = outcomesMaxDouble.length > 0 
    ? Math.max(...outcomesMaxDouble.map(o => o.normValue || 0))
    : -1;
  
  // Special case: if no runners on base, set Good lower bound to 0
  if (startBases && !startBases.first && !startBases.second && !startBases.third) {
    goodMinValue = 0;
  } else if (!startBases) {
    // Fallback case when startBases is not provided
    goodMinValue = 0;
  }
  
  // Find the lowest norm_value for very good range
  // We want the minimum from these two scenarios:
  // 1. A run is scored and no outs occur
  // 2. Batter hits a triple (reaches third base) and no outs occur
  
  let veryGoodMinValue = 1; // Default if no qualifying outcomes
  let validOutcomes = [];
  
  // Debug: Let's examine all outcomes with no outs first
  const noOutOutcomes = outcomes.filter(o => o.outsGained === 0);
  
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
      if (!startBases || !startBases.third) {
        // Third base wasn't occupied before
        const initialRunners = startBases ? 
          ((startBases.first ? 1 : 0) + (startBases.second ? 1 : 0) + (startBases.third ? 1 : 0)) : 0;
        
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
    
    // Debug logging - remove this later
    console.log('Very Good valid outcomes:', validOutcomes);
    console.log('Very Good min value:', veryGoodMinValue);
  }
  
  
  // Calculate percentiles
  const getPercentile = (p: number) => {
    const index = Math.floor((p / 100) * normValues.length);
    return normValues[Math.min(index, normValues.length - 1)];
  };
  
  const p25 = getPercentile(25);
  const p40 = getPercentile(40);
  const p75 = getPercentile(75);
  const p90 = getPercentile(90);
  
  // Determine bad range based on whether double plays are possible
  const badMin = maxDoublePlayValue !== null 
    ? maxDoublePlayValue + 0.001  // Just above highest double play (but don't include it)
    : minOneOutNoRunValue;        // Full range if no double plays
  
  // Create ranges based on outcome types
  return {
    veryBadMax: maxOutNoRunValue,     // From -1 to highest out with no runs
    badMin: badMin,                   // Conditional based on double play possibility
    badMax: maxOneOutNoRunValue,      // to highest single out with no runs
    neutralMin: minOneOutNoRunValue,  // From lowest single out with no runs
    neutralMax: maxNoOutsNoRunsValue, // to highest no-outs, no-runs outcome
    goodMin: goodMinValue,
    goodMax: goodMaxValue,
    veryGoodMin: veryGoodMinValue,    // Lowest of: run scored with no outs OR triple hit
    veryGoodMax: 1                    // Upper limit of 1
  };
}

// Filter outcomes by quality using dynamic ranges based on the specific outcome set
export function filterOutcomesByQuality(outcomes: PlayOutcome[], quality: string, startBases?: BaseState): PlayOutcome[] {
  const thresholds = calculateQualityThresholds(outcomes, startBases);
  
  // Calculate percentiles
  const normValues = outcomes
    .map(o => o.normValue || 0)
    .sort((a, b) => a - b);
  
  const getPercentile = (p: number) => {
    const index = Math.floor((p / 100) * normValues.length);
    return normValues[Math.min(index, normValues.length - 1)];
  };
  
  const p25 = getPercentile(25);
  const p75 = getPercentile(75);
  
  return outcomes.filter(outcome => {
    const normValue = outcome.normValue || 0;
    
    switch (quality) {
      case 'very-bad':
        // From -1 to highest out with no runs
        return normValue >= -1 && normValue <= thresholds.veryBadMax;
      
      case 'bad':
        // From lowest to highest single out with no runs
        return normValue >= thresholds.badMin && normValue <= thresholds.badMax;
      
      case 'neutral':
        return normValue >= thresholds.neutralMin && normValue <= thresholds.neutralMax;
      
      case 'good':
        return normValue >= thresholds.goodMin && normValue <= thresholds.goodMax;
      
      case 'very-good':
        return normValue >= thresholds.veryGoodMin && normValue <= thresholds.veryGoodMax;
      
      default:
        return true;
    }
  });
}