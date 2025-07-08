import { NextRequest, NextResponse } from 'next/server';

// API route to proxy Polymarket CLOB price requests and avoid CORS issues
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tokenId = searchParams.get('token_id');
  const side = searchParams.get('side');
  
  if (!tokenId) {
    return NextResponse.json(
      { error: 'token_id parameter is required' },
      { status: 400 }
    );
  }

  if (!side || (side !== 'buy' && side !== 'sell')) {
    return NextResponse.json(
      { error: 'side parameter is required and must be "buy" or "sell"' },
      { status: 400 }
    );
  }

  try {
    console.log(`💰 Server-side: Fetching ${side} price for token: ${tokenId}`);
    
    // Make the request to CLOB API from the server (no CORS issues)
    const clobUrl = `https://clob.polymarket.com/price?token_id=${tokenId}&side=${side}`;
    console.log(`📡 Server-side request to: ${clobUrl}`);
    
    const response = await fetch(clobUrl, { method: 'GET' });
    
    console.log(`📊 CLOB API response: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      throw new Error(`CLOB API failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Successfully fetched price data:`, data);
    
    // Return the data with CORS headers
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
    
  } catch (error) {
    console.error(`❌ Server-side price API error:`, error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch from CLOB API',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}