import { NextRequest, NextResponse } from 'next/server';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  console.log(`\n=== PYTHON POLYMARKET ORDER CREATION START ===`);
  
  try {
    const body = await request.json();
    const { tokenID, price = 0.5, size = 1 } = body;
    
    if (!tokenID) {
      throw new Error('tokenID is required');
    }
    
    console.log(`🐍 Calling Python backend for order creation...`);
    console.log(`📍 Token ID: ${tokenID}`);
    console.log(`📍 Price: ${price}`);
    console.log(`📍 Size: ${size}`);
    
    // Call Python backend
    const response = await fetch(`${PYTHON_BACKEND_URL}/create_order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tokenID,
        price,
        size
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Python backend error: ${response.status} - ${errorData}`);
    }
    
    const result = await response.json();
    console.log(`✅ Python backend response:`, result);
    
    return NextResponse.json({
      success: true,
      message: 'Order created via Python backend',
      result
    });
    
  } catch (error) {
    console.error(`❌ Python order creation failed:`, error);
    console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Python order creation failed'
      },
      { status: 500 }
    );
  } finally {
    console.log(`=== PYTHON POLYMARKET ORDER CREATION END ===\n`);
  }
}