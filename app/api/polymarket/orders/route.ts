import { NextRequest, NextResponse } from 'next/server';
import { orderManager, CreateOrderParams } from '@/utils/polymarketOrders';

// API route to handle order creation
export async function POST(request: NextRequest) {
  try {
    console.log(`📋 Server-side: Processing order creation request...`);
    
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

    console.log(`📤 Creating order:`, {
      tokenId,
      price: parseFloat(price),
      size: parseInt(size),
      side
    });

    // Create the order
    const orderParams: CreateOrderParams = {
      tokenId,
      price: parseFloat(price),
      size: parseInt(size),
      side
    };

    const result = await orderManager.createOrder(orderParams);

    if (result.success) {
      console.log(`✅ Order created successfully:`, result);
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

// API route to get current orders
export async function GET(request: NextRequest) {
  try {
    console.log(`📋 Server-side: Fetching current orders...`);
    
    const orders = await orderManager.getOrders();
    
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