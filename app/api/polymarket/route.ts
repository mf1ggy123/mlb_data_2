import { NextRequest, NextResponse } from 'next/server';

// API route to proxy Polymarket requests and avoid CORS issues
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const slug = searchParams.get('slug');
  
  if (!slug) {
    return NextResponse.json(
      { error: 'Slug parameter is required' },
      { status: 400 }
    );
  }

  try {
    console.log(`🔍 Server-side API: Fetching Polymarket data for slug: ${slug}`);
    
    // Make the request from the server (no CORS issues)
    const polymarketUrl = `https://gamma-api.polymarket.com/markets?slug=${slug}&active=true`;
    console.log(`📡 Server-side request to: ${polymarketUrl}`);
    
    const options = { method: 'GET' };
    const response = await fetch(polymarketUrl, options);
    
    console.log(`📊 Polymarket API response: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      throw new Error(`Polymarket API failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Successfully fetched data:`, {
      isArray: Array.isArray(data),
      length: Array.isArray(data) ? data.length : 'not array',
      hasData: !!data
    });
    
    // Extract and log clobTokenIds if available
    if (data && Array.isArray(data) && data.length > 0 && data[0].clobTokenIds) {
      let clobTokenIds = data[0].clobTokenIds;
      console.log(`🎯 Found clobTokenIds (raw):`, clobTokenIds);
      
      // If clobTokenIds is a string, parse it as JSON
      if (typeof clobTokenIds === 'string') {
        try {
          clobTokenIds = JSON.parse(clobTokenIds);
          console.log(`🔄 Parsed clobTokenIds:`, clobTokenIds);
        } catch (error) {
          console.error(`❌ Failed to parse clobTokenIds string:`, error);
        }
      }
      
      // Extract token IDs if we have an array with at least 2 elements
      if (Array.isArray(clobTokenIds) && clobTokenIds.length >= 2) {
        console.log(`📍 AWAY_TOKEN_ID: ${clobTokenIds[0]}`);
        console.log(`🏠 HOME_TOKEN_ID: ${clobTokenIds[1]}`);
        
        // Update the data object with parsed token IDs
        data[0].parsedClobTokenIds = clobTokenIds;
      }
    }
    
    // Return the data with CORS headers
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
    
  } catch (error) {
    console.error(`❌ Server-side API error:`, error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch from Polymarket API',
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