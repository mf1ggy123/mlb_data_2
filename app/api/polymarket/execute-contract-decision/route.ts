import { NextRequest, NextResponse } from 'next/server';

interface BasesState {
  first: boolean;
  second: boolean;
  third: boolean;
}

interface GameState {
  homeScore: number;
  awayScore: number;
  inning: number;
  isTopOfInning: boolean;
  outs: number;
  strikes: number;
  balls: number;
  bases: BasesState;
  homeTeam: string;
  awayTeam: string;
}

interface PlayOutcome {
  description: string;
  runsScored: number;
  outsGained: number;
  probability: number;
  normValue?: number;
  finalBases?: BasesState;
}

interface MarketPrices {
  awayPrices?: any;
  homePrices?: any;
}

interface ContractDecisionRequest {
  gameState: GameState;
  playOutcome?: PlayOutcome;
  marketPrices?: MarketPrices;
  tokenID?: string;
  trigger: string;
  maxRiskSize?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: ContractDecisionRequest = await request.json();
    
    console.log('🚀 Frontend received contract execution request:', {
      trigger: body.trigger,
      gameState: `${body.gameState.homeTeam} ${body.gameState.homeScore} - ${body.gameState.awayScore} ${body.gameState.awayTeam}`,
      inning: `${body.gameState.isTopOfInning ? 'Top' : 'Bottom'} ${body.gameState.inning}`,
      playOutcome: body.playOutcome?.description
    });

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
    
    // Forward to Python backend for execution
    const response = await fetch(`${pythonBackendUrl}/execute_contract_decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Python backend error:', errorText);
      throw new Error(`Python backend responded with ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    console.log('⚡ Contract decision execution result:', {
      executed: result.executed,
      team: result.decision?.team,
      size: result.decision?.size,
      message: result.message
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Contract execution API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}