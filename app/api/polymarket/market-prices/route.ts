import { NextRequest, NextResponse } from 'next/server';

interface MarketPricesRequest {
  gameId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: MarketPricesRequest = await request.json();
    
    console.log('💰 Frontend received market prices request:', {
      gameId: body.gameId
    });

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
    
    // Forward to Python backend for market prices
    const response = await fetch(`${pythonBackendUrl}/market_prices`, {
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
    
    console.log('📊 Market prices result:', {
      success: result.success,
      prices: result.prices
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Market prices API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}