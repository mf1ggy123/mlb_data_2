import { NextRequest, NextResponse } from 'next/server';

interface SyncGameStateRequest {
  gameState: any;
}

export async function POST(request: NextRequest) {
  try {
    const body: SyncGameStateRequest = await request.json();
    
    console.log('🔄 Frontend received game state sync request:', {
      homeTeam: body.gameState?.homeTeam,
      awayTeam: body.gameState?.awayTeam,
      inning: body.gameState?.inning,
      isTopOfInning: body.gameState?.isTopOfInning,
      outs: body.gameState?.outs,
      balls: body.gameState?.balls,
      strikes: body.gameState?.strikes
    });

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
    
    // Forward to Python backend for game state storage
    const response = await fetch(`${pythonBackendUrl}/sync_game_state`, {
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
    
    console.log('✅ Game state sync result:', {
      success: result.success,
      gameId: result.game_id
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Game state sync API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}