import { NextRequest, NextResponse } from 'next/server';
import { createHomeTeamBuyOrderOfficial } from '@/utils/polymarketOrdersOfficial';

// API route to create a buy order for the home team using official client
export async function POST(request: NextRequest) {
  try {
    console.log(`🏠 Server-side: Creating home team buy order with official client...`);
    
    const body = await request.json();
    const { tokenId, price } = body;
    
    // Validate required fields
    if (!tokenId) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing required field: tokenId'
        },
        { status: 400 }
      );
    }

    let orderPrice = price;
    
    // If no price provided, use default of 50 cents
    if (!orderPrice) {
      orderPrice = 0.5; // Default to 50¢
      console.log(`💰 No price provided, using default: 50¢`);
    }

    console.log(`🏠 Creating home team buy order with official client:`, {
      tokenId,
      price: orderPrice,
      size: 1
    });

    // Create the buy order for 1 share using official client
    const result = await createHomeTeamBuyOrderOfficial(tokenId, orderPrice);

    if (result.success) {
      console.log(`✅ Home team buy order created successfully with official client:`, result);
      return NextResponse.json({
        ...result,
        orderDetails: {
          team: 'home',
          tokenId,
          price: orderPrice,
          priceFormatted: `${(orderPrice * 100).toFixed(2)}¢`,
          size: 1,
          side: 'BUY'
        }
      });
    } else {
      console.error(`❌ Home team buy order creation failed:`, result.error);
      return NextResponse.json(result, { status: 400 });
    }
    
  } catch (error) {
    console.error(`❌ Server-side home team order creation error:`, error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Home team order creation service error'
      },
      { status: 500 }
    );
  }
}