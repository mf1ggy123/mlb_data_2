import { NextRequest, NextResponse } from 'next/server';
import { clobManager, CreateOrderParams } from '@/utils/polymarketClobClient';
import { Side } from '@polymarket/clob-client';

// API route to handle order creation using proper CLOB client
export async function POST(request: NextRequest) {
  try {
    console.log(`📋 Server-side: Processing order creation with proper CLOB client...`);
    
    const body = await request.json();
    const { tokenID, price, size, side } = body;
    
    // Validate required fields
    if (!tokenID || !price || !size || !side) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing required fields: tokenID, price, size, side'
        },
        { status: 400 }
      );
    }

    // Validate and convert side
    let orderSide: Side;
    if (side === 'BUY') {
      orderSide = Side.BUY;
    } else if (side === 'SELL') {
      orderSide = Side.SELL;
    } else {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid side: must be BUY or SELL'
        },
        { status: 400 }
      );
    }

    console.log(`📤 Creating order with proper CLOB client:`, {
      tokenID,
      price: parseFloat(price),
      size: parseInt(size),
      side: orderSide
    });

    // Create the order using proper CLOB client
    const orderParams: CreateOrderParams = {
      tokenID,
      price: parseFloat(price),
      size: parseInt(size),
      side: orderSide
    };

    const result = await clobManager.createOrder(orderParams);

    if (result.success) {
      console.log(`✅ Order created successfully with proper CLOB client:`, result);
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

// API route to get current orders using proper CLOB client
export async function GET(request: NextRequest) {
  try {
    console.log(`📋 Server-side: Fetching current orders with proper CLOB client...`);
    
    const orders = await clobManager.getOrders();
    
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