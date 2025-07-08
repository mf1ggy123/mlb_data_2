import { NextRequest, NextResponse } from 'next/server';
import { officialOrderManager, CreateOrderParams } from '@/utils/polymarketOrdersOfficial';

// API route to handle order creation using official Polymarket client
export async function POST(request: NextRequest) {
  try {
    console.log(`📋 Server-side: Processing order creation with official client...`);
    
    const body = await request.json();
    const { tokenId, price, size, side } = body;
    
    // Validate required fields
    if (!tokenId || !price || !size || !side) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing required fields: tokenId, price, size, side'
        },
        { status: 400 }
      );
    }

    // Validate side
    if (side !== 'BUY' && side !== 'SELL') {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid side: must be BUY or SELL'
        },
        { status: 400 }
      );
    }

    console.log(`📤 Creating order with official client:`, {
      tokenId,
      price: parseFloat(price),
      size: parseInt(size),
      side
    });

    // Create the order using official client
    const orderParams: CreateOrderParams = {
      tokenId,
      price: parseFloat(price),
      size: parseInt(size),
      side
    };

    const result = await officialOrderManager.createOrder(orderParams);

    if (result.success) {
      console.log(`✅ Order created successfully with official client:`, result);
      return NextResponse.json(result);
    } else {
      console.error(`❌ Order creation failed:`, result.error);
      return NextResponse.json(result, { status: 400 });
    }
    
  } catch (error) {
    console.error(`❌ Server-side order creation error:`, error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Order creation service error'
      },
      { status: 500 }
    );
  }
}

// API route to get current orders using official client
export async function GET(request: NextRequest) {
  try {
    console.log(`📋 Server-side: Fetching current orders with official client...`);
    
    const orders = await officialOrderManager.getOrders();
    
    return NextResponse.json({
      success: true,
      orders
    });
    
  } catch (error) {
    console.error(`❌ Server-side orders fetch error:`, error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Orders fetch service error'
      },
      { status: 500 }
    );
  }
}