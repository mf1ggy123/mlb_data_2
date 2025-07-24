import { GameState } from '@/types/baseball';
import { PlayOutcome } from '@/utils/baseballData';

interface ContractDecisionRequest {
  gameState: GameState;
  playOutcome?: PlayOutcome;
  marketPrices?: any;
  tokenID?: string;
  trigger: string;
  maxRiskSize?: number;
  gameId?: string;
}

interface ContractDecision {
  should_order: boolean;
  team: string | null;
  confidence: number;
  size: number;
  reasoning: string[];
  risk_level: string;
  transactions?: any[];
  current_portfolio?: { home: number; away: number };
  current_balance?: number;
}

interface PredictiveDecision {
  should_order: boolean;
  action: string; // "BUY_HOME", "BUY_AWAY", "SELL_HOME", "SELL_AWAY", "HOLD"
  team: string | null;
  confidence: number;
  size: number;
  reasoning: string[];
  expected_value: number;
  current_win_probability: { home: number; away: number } | null;
  potential_outcomes: any[];
  transactions: any[];
  current_portfolio: { home: number; away: number };
  current_balance: number;
}

interface ContractDecisionResponse {
  success: boolean;
  decision: ContractDecision;
  gameState: GameState;
  trigger: string;
  executed?: boolean;
  order?: any;
  message?: string;
  error?: string;
}

/**
 * Sync game state to backend
 */
export async function syncGameState(gameState: GameState): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    console.log('🔄 Syncing game state to backend:', gameState);

    const response = await fetch('/api/polymarket/sync-game-state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ gameState }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Game state synced successfully');
    }

    return result;
  } catch (error) {
    console.error('❌ Game state sync error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Analyze game state and get contract decision recommendation
 */
/**
 * Initialize a new game with $1000 starting balance
 */
export async function initializeGame(
  homeTeam: string,
  awayTeam: string,
  gameId?: string
): Promise<{
  success: boolean;
  game_id?: string;
  balance?: number;
  contracts?: { home: number; away: number };
  message?: string;
  error?: string;
}> {
  try {
    const requestData = {
      home_team: homeTeam,
      away_team: awayTeam,
      game_id: gameId
    };

    console.log('🎮 Initializing game:', requestData);

    const response = await fetch('/api/polymarket/initialize-game', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Game initialized:', {
        game_id: result.game_id,
        balance: result.balance
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Game initialization error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Get current balance and portfolio for a game
 */
export async function getGameBalance(gameId: string): Promise<{
  success: boolean;
  balance?: number;
  contracts?: { home: number; away: number };
  total_invested?: number;
  total_profit_loss?: number;
  history?: any[];
  error?: string;
}> {
  try {
    console.log('💰 Getting balance for game:', gameId);

    const response = await fetch(`/api/polymarket/game-balance/${gameId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success) {
      console.log('📊 Balance retrieved:', {
        balance: result.balance,
        contracts: result.contracts
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Balance retrieval error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function analyzeContractDecision(
  gameState: GameState,
  playOutcome?: PlayOutcome,
  trigger: string = 'manual',
  marketPrices?: any,
  maxRiskSize: number = 10,
  gameId?: string
): Promise<ContractDecisionResponse> {
  try {
    const requestData: ContractDecisionRequest = {
      gameState,
      playOutcome,
      marketPrices,
      trigger,
      maxRiskSize,
      gameId,
      tokenID: "74222696496792012687871550915060213431290440776324791435820797297779043018992"
    };

    console.log('📊 Analyzing contract decision:', {
      trigger,
      gameId,
      gameState: `${gameState.homeTeam} ${gameState.homeScore} - ${gameState.awayScore} ${gameState.awayTeam}`,
      inning: `${gameState.isTopOfInning ? 'Top' : 'Bottom'} ${gameState.inning}`,
      playOutcome: playOutcome?.description
    });

    const response = await fetch('/api/polymarket/contract-decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Contract decision analysis failed');
    }

    console.log('🧠 Contract decision result:', {
      shouldOrder: result.decision?.should_order,
      team: result.decision?.team,
      size: result.decision?.size,
      confidence: result.decision?.confidence,
      reasoning: result.decision?.reasoning?.join('; ')
    });

    return result;
  } catch (error) {
    console.error('❌ Contract decision analysis error:', error);
    return {
      success: false,
      decision: {
        should_order: false,
        team: null,
        confidence: 0,
        size: 0,
        reasoning: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        risk_level: 'none'
      },
      gameState,
      trigger,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Execute contract decision automatically (analyze + place order if recommended)
 */
export async function executeContractDecision(
  gameState: GameState,
  playOutcome?: PlayOutcome,
  trigger: string = 'manual',
  marketPrices?: any,
  maxRiskSize: number = 10,
  gameId?: string
): Promise<ContractDecisionResponse> {
  try {
    const requestData: ContractDecisionRequest = {
      gameState,
      playOutcome,
      marketPrices,
      trigger,
      maxRiskSize,
      gameId,
      tokenID: "74222696496792012687871550915060213431290440776324791435820797297779043018992"
    };

    console.log('🚀 Executing contract decision:', {
      trigger,
      gameId,
      gameState: `${gameState.homeTeam} ${gameState.homeScore} - ${gameState.awayScore} ${gameState.awayTeam}`,
      inning: `${gameState.isTopOfInning ? 'Top' : 'Bottom'} ${gameState.inning}`,
      playOutcome: playOutcome?.description
    });

    const response = await fetch('/api/polymarket/execute-contract-decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Contract decision execution failed');
    }

    console.log('⚡ Contract execution result:', {
      executed: result.executed,
      team: result.decision?.team,
      size: result.decision?.size,
      message: result.message
    });

    return result;
  } catch (error) {
    console.error('❌ Contract execution error:', error);
    return {
      success: false,
      decision: {
        should_order: false,
        team: null,
        confidence: 0,
        size: 0,
        reasoning: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        risk_level: 'none'
      },
      gameState,
      trigger,
      executed: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Check if a play outcome should trigger contract analysis
 */
export function shouldTriggerContractAnalysis(playOutcome?: PlayOutcome): boolean {
  if (!playOutcome || playOutcome.normValue === null || playOutcome.normValue === undefined) {
    return false;
  }

  // Trigger on high-impact plays (very good or very bad)
  const normValue = playOutcome.normValue;
  return Math.abs(normValue) >= 0.8;
}

/**
 * Check if game state represents a high-leverage situation
 */
export function isHighLeverageSituation(gameState: GameState): boolean {
  const bases_loaded = gameState.bases.first && gameState.bases.second && gameState.bases.third;
  const runners_in_scoring = gameState.bases.second || gameState.bases.third;
  const high_leverage = gameState.outs >= 2 && runners_in_scoring;
  const late_inning = gameState.inning >= 7;
  const close_game = Math.abs(gameState.homeScore - gameState.awayScore) <= 2;
  
  return (high_leverage && late_inning && close_game) || (bases_loaded && gameState.outs <= 1);
}

/**
 * Get win percentage for current game state
 */
export async function getWinPercentage(gameState: GameState): Promise<{
  success: boolean;
  home_win_percentage?: number;
  away_win_percentage?: number;
  message?: string;
  error?: string;
}> {
  try {
    console.log('📊 Getting win percentage for game state:', {
      gameState: `${gameState.homeTeam} ${gameState.homeScore} - ${gameState.awayScore} ${gameState.awayTeam}`,
      inning: `${gameState.isTopOfInning ? 'Top' : 'Bottom'} ${gameState.inning}`,
      situation: `${gameState.outs} outs, ${gameState.balls}-${gameState.strikes} count`
    });

    const response = await fetch('/api/polymarket/win-percentage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gameState),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success) {
      console.log('📈 Win percentages:', {
        home: `${(result.home_win_percentage * 100).toFixed(1)}%`,
        away: `${(result.away_win_percentage * 100).toFixed(1)}%`
      });
    } else {
      console.log('❌ No win percentage data available');
    }

    return result;
  } catch (error) {
    console.error('❌ Win percentage error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Analyze all potential outcomes BEFORE a play happens (predictive analysis)
 */
export async function analyzePredictiveDecision(
  gameState: GameState,
  gameId?: string,
  maxRiskSize: number = 10
): Promise<{
  success: boolean;
  decision?: PredictiveDecision;
  error?: string;
}> {
  try {
    const requestData = {
      gameState,
      gameId,
      maxRiskSize
    };

    console.log('🔮 Performing predictive analysis:', {
      gameId,
      gameState: `${gameState.homeTeam} ${gameState.homeScore} - ${gameState.awayScore} ${gameState.awayTeam}`,
      inning: `${gameState.isTopOfInning ? 'Top' : 'Bottom'} ${gameState.inning}`,
      situation: `${gameState.outs} outs, ${gameState.balls}-${gameState.strikes} count`
    });

    const response = await fetch('/api/polymarket/predictive-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Predictive analysis failed');
    }

    console.log('🧠 Predictive analysis result:', {
      action: result.decision.action,
      shouldOrder: result.decision.should_order,
      expectedValue: result.decision.expected_value,
      confidence: result.decision.confidence
    });

    return result;
  } catch (error) {
    console.error('❌ Predictive analysis error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Execute predictive contract decision (analyze + execute trades)
 */
export async function executePredictiveDecision(
  gameState: GameState,
  gameId?: string,
  maxRiskSize: number = 10
): Promise<{
  success: boolean;
  executed?: boolean;
  decision?: PredictiveDecision;
  transactions?: any[];
  final_balance?: any;
  message?: string;
  error?: string;
}> {
  try {
    const requestData = {
      gameState,
      gameId,
      maxRiskSize
    };

    console.log('🚀 Executing predictive decision:', {
      gameId,
      gameState: `${gameState.homeTeam} ${gameState.homeScore} - ${gameState.awayScore} ${gameState.awayTeam}`,
      inning: `${gameState.isTopOfInning ? 'Top' : 'Bottom'} ${gameState.inning}`,
      situation: `${gameState.outs} outs, ${gameState.balls}-${gameState.strikes} count`
    });

    const response = await fetch('/api/polymarket/execute-predictive-decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Predictive execution failed');
    }

    console.log('⚡ Predictive execution result:', {
      executed: result.executed,
      action: result.decision?.action,
      message: result.message
    });

    return result;
  } catch (error) {
    console.error('❌ Predictive execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Format predictive decision for display
 */
export function formatPredictiveDecision(decision: PredictiveDecision): string {
  if (!decision.should_order) {
    return `🔮 Recommendation: ${decision.action} (EV: ${decision.expected_value.toFixed(3)})`;
  }
  
  const actionLabels: { [key: string]: string } = {
    'BUY_HOME': 'Buy Home',
    'BUY_AWAY': 'Buy Away', 
    'SELL_HOME': 'Sell Home',
    'SELL_AWAY': 'Sell Away',
    'HOLD': 'Hold Position'
  };
  
  const actionLabel = actionLabels[decision.action] || decision.action;
  return `🔮 ${actionLabel}: ${decision.size} shares (EV: ${decision.expected_value.toFixed(3)}, ${(decision.confidence * 100).toFixed(0)}% confidence)`;
}

/**
 * Get current Polymarket prices for a game
 */
export async function getCurrentMarketPrices(gameId: string): Promise<{
  success: boolean;
  prices?: { home: number; away: number };
  error?: string;
}> {
  try {
    console.log('💰 Getting current market prices for game:', gameId);

    const response = await fetch('/api/polymarket/market-prices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ gameId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success) {
      console.log('📊 Market prices retrieved:', result.prices);
    }

    return result;
  } catch (error) {
    console.error('❌ Market prices error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Format contract decision for display
 */
export function formatContractDecision(decision: ContractDecision): string {
  if (!decision.should_order) {
    return "No contract order recommended";
  }
  
  return `📊 Order: ${decision.size} shares for ${decision.team?.toUpperCase()} team (${(decision.confidence * 100).toFixed(0)}% confidence, ${decision.risk_level} risk)`;
}