import { NextRequest, NextResponse } from 'next/server';
import { createHomeTeamFOKOrder } from '@/utils/polymarketClobClient';

// API route to create a FOK buy order for the home team using proper CLOB client
export async function POST(request: NextRequest) {
  console.log(`\n=== HOME TEAM FOK ORDER CREATION START ===`);
  
  try {
    console.log(`🏠 Server-side: Creating home team FOK buy order with proper CLOB client...`);
    
    const body = await request.json();
    console.log(`📤 Request body received:`, body);
    
    const { tokenID, price } = body;
    
    // Validate required fields
    if (!tokenID) {
      console.log(`❌ Missing tokenID field`);
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing required field: tokenID'
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

    console.log(`🏠 Creating home team FOK buy order with proper CLOB client:`, {
      tokenID,
      price: orderPrice,
      size: 1,
      type: 'FOK'
    });

    console.log(`🚀 About to call createHomeTeamFOKOrder...`);
    
    // Create the FOK buy order for 1 share using proper CLOB client
    const result = await createHomeTeamFOKOrder(tokenID, orderPrice);
    
    console.log(`🎯 createHomeTeamFOKOrder result:`, result);

    if (result.success) {
      console.log(`✅ Home team FOK buy order created successfully:`, result);
      return NextResponse.json({
        ...result,
        orderDetails: {
          team: 'home',
          tokenID,
          price: orderPrice,
          priceFormatted: `${(orderPrice * 100).toFixed(2)}¢`,
          size: 1,
          side: 'BUY',
          type: 'FOK'
        }
      });
    } else {
      console.error(`❌ Home team FOK buy order creation failed:`, result.error);
      return NextResponse.json(result, { status: 400 });
    }
    
  } catch (error) {
    console.error(`❌ Server-side home team FOK order creation error:`, error);
    console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Home team FOK order creation service error'
      },
      { status: 500 }
    );
  } finally {
    console.log(`=== HOME TEAM FOK ORDER CREATION END ===\n`);
  }
}