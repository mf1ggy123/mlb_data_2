import { NextRequest, NextResponse } from 'next/server';

interface InitializeGameRequest {
  game_id?: string;
  home_team: string;
  away_team: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: InitializeGameRequest = await request.json();
    
    console.log('🎮 Initializing new game:', {
      home_team: body.home_team,
      away_team: body.away_team,
      game_id: body.game_id
    });

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
    
    const response = await fetch(`${pythonBackendUrl}/initialize_game`, {
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
    
    console.log('✅ Game initialized:', {
      game_id: result.game_id,
      balance: result.balance,
      message: result.message
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Game initialization API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}