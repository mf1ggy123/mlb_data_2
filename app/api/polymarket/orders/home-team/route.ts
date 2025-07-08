import { NextRequest, NextResponse } from 'next/server';
import { createHomeTeamBuyOrder, getBestBuyPrice, formatPrice } from '@/utils/polymarketOrders';

// API route to create a buy order for the home team
export async function POST(request: NextRequest) {
  try {
    console.log(`🏠 Server-side: Creating home team buy order...`);
    
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
    
    // If no price provided, try to get the best buy price
    if (!orderPrice) {
      console.log(`💰 No price provided, fetching best buy price...`);
      const bestPrice = await getBestBuyPrice(tokenId);
      if (bestPrice) {
        orderPrice = bestPrice;
        console.log(`💰 Using best buy price: ${formatPrice(bestPrice)}`);
      } else {
        return NextResponse.json(
          { 
            success: false,
            error: 'No price provided and unable to determine best buy price'
          },
          { status: 400 }
        );
      }
    }

    console.log(`🏠 Creating home team buy order:`, {
      tokenId,
      price: orderPrice,
      size: 1
    });

    // Create the buy order for 1 share
    const result = await createHomeTeamBuyOrder(tokenId, orderPrice);

    if (result.success) {
      console.log(`✅ Home team buy order created successfully:`, result);
      return NextResponse.json({
        ...result,
        orderDetails: {
          team: 'home',
          tokenId,
          price: orderPrice,
          priceFormatted: formatPrice(orderPrice),
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