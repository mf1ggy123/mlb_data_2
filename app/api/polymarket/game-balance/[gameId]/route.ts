import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId;
    
    console.log('💰 Getting balance for game:', gameId);

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
    
    const response = await fetch(`${pythonBackendUrl}/game_balance/${gameId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Python backend error:', errorText);
      throw new Error(`Python backend responded with ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    console.log('📊 Balance retrieved:', {
      game_id: result.game_id,
      balance: result.balance,
      contracts: result.contracts
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Game balance API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}