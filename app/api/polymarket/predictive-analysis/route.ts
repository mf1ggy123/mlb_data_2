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

interface PredictiveAnalysisRequest {
  gameState: GameState;
  gameId?: string;
  maxRiskSize?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: PredictiveAnalysisRequest = await request.json();
    
    console.log('🔮 Frontend received predictive analysis request:', {
      gameState: `${body.gameState.homeTeam} ${body.gameState.homeScore} - ${body.gameState.awayScore} ${body.gameState.awayTeam}`,
      inning: `${body.gameState.isTopOfInning ? 'Top' : 'Bottom'} ${body.gameState.inning}`,
      situation: `${body.gameState.outs} outs, ${body.gameState.balls}-${body.gameState.strikes} count`
    });

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
    
    // Forward to Python backend for predictive analysis
    const response = await fetch(`${pythonBackendUrl}/predictive_analysis`, {
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
    
    console.log('✅ Predictive analysis completed:', {
      action: result.decision?.action,
      shouldOrder: result.decision?.should_order,
      expectedValue: result.decision?.expected_value,
      confidence: result.decision?.confidence
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Predictive analysis API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}