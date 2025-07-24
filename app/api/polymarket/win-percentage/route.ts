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

export async function POST(request: NextRequest) {
  try {
    const gameState: GameState = await request.json();
    
    console.log('📊 Getting win percentage for:', {
      gameState: `${gameState.homeTeam} ${gameState.homeScore} - ${gameState.awayScore} ${gameState.awayTeam}`,
      inning: `${gameState.isTopOfInning ? 'Top' : 'Bottom'} ${gameState.inning}`,
      situation: `${gameState.outs} outs, ${gameState.balls}-${gameState.strikes} count`
    });

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
    
    const response = await fetch(`${pythonBackendUrl}/win_percentage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gameState),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Python backend error:', errorText);
      throw new Error(`Python backend responded with ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    console.log('📈 Win percentage result:', {
      success: result.success,
      homeWinPct: result.home_win_percentage ? `${(result.home_win_percentage * 100).toFixed(1)}%` : 'N/A',
      awayWinPct: result.away_win_percentage ? `${(result.away_win_percentage * 100).toFixed(1)}%` : 'N/A'
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Win percentage API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}